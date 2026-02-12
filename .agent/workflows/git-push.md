---
description: Git push and merge workflow rules
---

## 规则

1. 修改文件、完成功能后，只做本地 `git commit`
2. **必须先询问用户是否要推送到远程**，等待用户确认
3. 只有用户明确要求后，才执行 `git push`、合并分支、打 tag 等操作
4. **禁止**在一次操作中连续执行 push + merge + push，除非用户主动要求
