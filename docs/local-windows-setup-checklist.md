# 在 yichuan 的 Windows 上开发这个 Metabase fork

日常开发放在 WSL Ubuntu 里。仓库在 Windows 磁盘上，WSL 通过 `/mnt/c` 访问同一份文件。原生 Windows 上的 JDK 和 Clojure 只用来对照版本。启动后端和前端热更新用下面的两条 WSL 命令。

通用的 Metabase 开发环境步骤见 [开发环境文档](developers-guide/devenv.md)。下面是这台机器上已经装好的版本，以及启动时实际会碰到的问题。

## 仓库

- Windows 路径：`C:\Users\Administrator\src\metabase`
- 远程：<https://github.com/lvchao377/metabase>
- WSL 路径：`/mnt/c/Users/Administrator/src/metabase`

## Windows 上的工具

| 组件         | 版本             | 安装方式                                                                                                                            |
| ------------ | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Git          | 2.55.0.windows.3 | 本机 Git for Windows                                                                                                                |
| Temurin JDK  | 21.0.13          | `winget install EclipseAdoptium.Temurin.21.JDK`                                                                                     |
| Node.js      | 22.16.0          | nvm-windows                                                                                                                         |
| Bun          | 1.4.4            | 本机已安装的 Bun 1.4.4                                                                                                              |
| yarn         | 4.18.1           | `corepack enable` 之后由 Corepack 提供                                                                                              |
| ClojureTools | 1.12.1.1550      | PowerShell 模块。交互式安装程序被拦住，改为下载 `clojure-tools.zip`，把里面的 `ClojureTools` 模块拷到当前用户的 PowerShell 模块目录 |

仓库脚本以 Bun 为准。前端热更新用 `bun run build-hot`。yarn 4.18.1 留在这台机器上，给明确要求 yarn 的工具用。

## WSL Ubuntu 24.04（用户 `datus`）

| 组件        | 版本        |
| ----------- | ----------- |
| OpenJDK     | 21.0.12.1   |
| Node.js     | 22.23.4     |
| Bun         | 1.4.4       |
| Clojure CLI | 1.12.6.1673 |

发行版名称是 `Ubuntu-24.04`。

## 每天开两个终端

都在 WSL 里，工作目录用挂载路径：

```bash
cd /mnt/c/Users/Administrator/src/metabase
clojure -M:run:dev:dev-start --hot
```

另一个终端：

```bash
cd /mnt/c/Users/Administrator/src/metabase
bun run build-hot
```

后端默认在 `localhost:3000`。Rspack 开发服务器默认在 `8088`。先在 WSL 里确认进程起来，再从 Windows 浏览器打开。

## 已经踩过的坑

### 交互式 Clojure 安装程序被拦住

Windows 上的交互式 Clojure 安装程序在这台机器上走不完。改为下载 `clojure-tools.zip`，把其中的 `ClojureTools` PowerShell 模块手工拷到用户模块目录。装好的版本是 ClojureTools 1.12.1.1550。

### PowerShell 把 Java 的 stderr 当成错误

`clojure -P` 会往 stderr 打进度。PowerShell 把这些输出当成命令失败。准备依赖时改走 cmd，并把输出重定向走：

```bat
cmd /c "clojure -P > %TEMP%\clojure-prep.log 2>&1"
```

### 原生 Windows 后端会因 classpath 过长失败

在 PowerShell 或 cmd 里直接跑后端时，Java classpath 会超过 Windows 命令行长度，报「文件名或扩展名太长」。后端和前端热更新都在 WSL 里跑，目录是 `/mnt/c/Users/Administrator/src/metabase`。

### WSL 里的 sudo 会卡住

Ubuntu 里执行 `sudo` 可能一直停住。从 Windows 直接用 root 进发行版：

```powershell
wsl -d Ubuntu-24.04 -u root
```

### Windows 浏览器访问 WSL 服务可能失败

Windows 的代理不会自动进 WSL。浏览器走本机代理时，`localhost` 可能到不了 WSL 里的端口。先在 WSL 里用 curl 确认服务本身是通的：

```bash
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/api/health
```

这里返回非连接失败的状态码后，再查 Windows 侧的代理是否把 `localhost` 转走了。
