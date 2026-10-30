# storage domain 版本升级问题与解法

> 结论先行：**`compatibleVersions` 在 `single` layout 下不生效**，这是当前默认路径的一个缺口。可行的解法有三条，按代价排序在第 3 节。

## 1. 问题是什么

插件声明：

```js
const domainSpec = {
  name: 'local_global_tasks',
  version: 1,
  tables: { completions: { valueSchema: ... } },
}
const domain = await ctx.storageDomain.open(domainSpec)
```

只要改 `version`，或者增删 `tables`，下次启动就会抛 `version-mismatch`，**插件直接挂掉**，已有的完结记录也读不到。

## 2. 为什么不能自动迁移

这是**设计如此**，不是 bug。`dsh-storage` 的契约原文：

> A stored version differing from the descriptor rejects `version-mismatch` (no migration).

`defineDomain` 只做静态校验，`DomainFacility.open()` 拿到 backend 抛出的错误就直接向上抛，没有任何迁移钩子。

### 2.1 关键发现：`compatibleVersions` 是个半成品

`defineDomain` 接受一个 `compatibleVersions` 字段：

```js
if (spec.layout !== void 0) { ... }
for (const compat of spec.compatibleVersions ?? []) { ... }
```

它会被原样塞进 `descriptorOf(spec)` 交给 backend。但两个后端的行为不一样：

| layout | 版本比较 | 是否读 `compatibleVersions` |
| --- | --- | --- |
| `per-record` | `acceptedStamps(descriptor)` = `[version, ...compatibleVersions]` | ✅ 生效 |
| `single`（默认） | `if (version !== descriptor.version) throw` | ❌ **完全忽略** |

源码位置：`dsh-storage-json/lib/index.js`

```js
// single-unit 的 parse()，第 102 行
if (version !== descriptor.version) throw new StorageError('version-mismatch', ...)

// per-record 才有这段，第 353 行
function acceptedStamps(descriptor) {
  return [descriptor.version, ...descriptor.compatibleVersions ?? []]
}
```

官方自己踩过这个坑：`dsh-session-projection-cache` 明确用 `per-record` layout，README 里写「Records stamped with a version in the spec's `compatibleVersions` remain structurally readable」。**它绕开 single 正是因为这个缺口。**

所以「每次升级都遇到」的根因是：我们的 domain 用了默认的 `single` layout。

## 3. 三条解法

### 方案 A：换成 `per-record` layout（推荐，改动最小）

```js
const domainSpec = {
  name: 'local_global_tasks',
  version: 2,
  layout: 'per-record',          // ← 新增
  compatibleVersions: [1],       // ← 旧版本可读
  tables: { completions: { valueSchema: ... } },
}
```

效果：

- v1 的数据文件（`local_global_tasks.json`）**不会被删**。per-record 后端有 `bootstrapLegacyUnit()`，会读旧 single 文件并按 `acceptedStamps` 校验后搬进新目录（`local_global_tasks/`）。
- 以后每次加表/改 schema，只要把旧版本号加进 `compatibleVersions`，**旧记录仍能读出来**，不需要手动迁移。
- 版本推进变成：`version: 3, compatibleVersions: [1, 2]`。

代价：

- 存储从「一个 JSON 文件」变成「一个目录 + 每条记录一个文件」。记录数很少（每个会话一条），可忽略。
- 需要写一个一次性迁移逻辑，把 v1 记录按新 schema 补齐字段（如果有 schema 变化）。如果只是**加表**不改旧表，其实不需要迁移——旧记录照样通过旧 schema 校验。

**这是最贴近官方意图的解法，也是唯一一个「以后不再痛」的。**

### 方案 B：把版本号冻结在 1，靠 schema 自愈

不改 `version`，新增的能力放到**独立的新 domain**：

```js
const legacy = { name: 'local_global_tasks', version: 1, ... }   // 永不改
const dismissed = { name: 'local_global_dismissed', version: 1, ... }  // 新东西放这里
```

- 优点：零风险，永不触发 mismatch。
- 缺点：domain 会越来越多；跨 domain 没有事务；本质是把问题推后。
- 适合：**只增不改**的小功能。比如这次的「清除待处理」，我就是用这个思路——复用 `completions` 表，连新 domain 都没加。

### 方案 C：升级时捕获 mismatch，手动重置

```js
try {
  domain = await ctx.storageDomain.open(spec)
} catch (error) {
  if (error.code !== 'version-mismatch') throw error
  // 把旧文件改名备份，然后用新版本重建
}
```

- 优点：插件不会因为升级挂掉。
- 缺点：**旧数据事实上丢失**（只是备份了文件）。用户要重新点一遍所有 ✓。
- 适合：**兜底**，不应该是主策略。但强烈建议加上——总比整个插件白屏好。

## 4. 建议的组合

**A + C**：

1. 把 domain 切到 `per-record`，加上 `compatibleVersions: [1]`。以后升级不再需要改代码。
2. 同时保留 C 的 try/catch 兜底。万一将来 schema 变化大到旧记录过不了校验，插件降级为「记录清零但功能可用」，而不是白屏。

## 5. 对本插件的具体影响

当前 `local_global_tasks` 已切到 v2 + `per-record` + `compatibleVersions: [1]`。迁移路径：

- 旧文件：`~/.dsh/storages/local_global_tasks.json`
- 新位置：`~/.dsh/storages/local_global_tasks/completions/<sessionId>.json`
- `bootstrapLegacyUnit()` 在首次打开时自动搬过去，**旧文件保留不动**。

### 已用真实数据验证

用本机真实的 `local_global_tasks.json`（9 条完结记录）跑通了完整链路：

| 场景 | 结果 |
| --- | --- |
| v2 首次打开（从 v1 legacy 迁移） | **9 条全部读出**，生成 9 个 per-record 文件，旧 `local_global_tasks.json` 仍在 |
| 之后升到 v3，`compatibleVersions: [1, 2]` | **9 条仍可读**，无需迁移 |
| v3 但 `compatibleVersions: []` | 记录被当作 foreign 丢弃，读数为 0，**不抛错、不白屏** |

最后一行说明：即使将来漏配兼容版本，后果是「记录清零」而不是「插件挂掉」——配合第 4 节的兜底，最坏情况也可控。

## 6. 兜底：插件不会因存储故障白屏

`index.js` 的 `openDomain()` 捕获任何打开失败，降级为内存表并记录日志。此时：

- 侧栏任务区、会话树照常工作
- 「标记完结」「全部清除」的写入会返回明确错误：`Completion storage is unavailable; this change will not persist across restarts.`
- 不会静默假装成功

## 7. 一个上游问题

`compatibleVersions` 在 `single` layout 下被静默忽略，而 `defineDomain` 又允许传它——这会让人误以为已经处理了兼容。建议给上游提 issue：

> `defineDomain` accepts `compatibleVersions`, but the JSON backend's `single` layout rejects any version other than `descriptor.version`. Either honor the field in `single` or reject it in `defineDomain` when `layout !== 'per-record'`.

在那之前，**用 `per-record` 是唯一让这个字段真正生效的方式**。
