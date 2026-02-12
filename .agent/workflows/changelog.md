---
description: Update local changelog after modifications
---

## 规则

1. 每次完成功能修改并 commit 后，**必须**将改动记录写入 `CHANGELOG_LOCAL.md`，该文件仅本地保留（`.gitignore`）。
2. **格式标准**：

```markdown
## YYYY-MM-DD

### `commit_hash` 类别：一句话摘要 (HH:MM:SS)
- **摘要**：简明扼要地描述改动对用户或功能的影响。
- **涉及文件**：`path/to/file1`, `path/to/file2`
- **技术细节**：
  - `详细的每一条技术改动，方便 Code Review`
  - `例如：.class-name: 修改了 color: red`
  - `例如：functionName: 增加了参数 x`
```

3. **类别参考**：`feat`, `fix`, `style`, `docs`, `chore`, `refactor`, `perf`。
4. **禁止**仅堆砌 commit message，必须展开为技术细节。