# 天天象棋 Pikafish 本机分析助手

这是一个用于[天天象棋网页版](https://h5login.qqchess.qq.com/)的 Chromium 浏览器扩展。扩展读取正在显示的棋盘，在页面右侧绘制分析面板；本机 Python 服务调用 [Pikafish](https://github.com/official-pikafish/Pikafish) 引擎，返回一条最佳走法。用户可以只查看推荐，也可以自行开启自动落子。

支持普通中国象棋的人机对战和真人对战。扩展会区分红黑棋、跟随游戏棋盘的朝向，并在能够确认轮到我方时自动发起分析。真人对战中，如果面板的“我执”与游戏识别出的棋色不同，会提示调整。

## 运行环境

- Windows x86-64。项目附带的是 Windows 版 Pikafish 可执行文件；其他系统需要自行替换引擎并修改 `pikafish_bridge.py` 中的路径。
- Python 3.10 或更新版本，以及可用的 Windows `py` 启动器。Python 部分只使用标准库，无需运行 `pip install`。
- Chrome 或 Edge 等支持 Manifest V3 的 Chromium 浏览器，以及可访问天天象棋网页版的网络环境。不需要 Tampermonkey。
- 完整的项目目录，包括 `third_party/pikafish` 中的引擎程序和 `pikafish.nnue`。

## 快速开始

1. 从 [Releases](https://github.com/3DMXM/xiangqi-advisor/releases) 下载 `xiangqi-advisor-windows-vX.Y.Z.zip` 并解压，或复制**整个项目目录**。确认 `third_party/pikafish/Pikafish-Windows-x86-64-universal.exe` 和 `third_party/pikafish/pikafish.nnue` 都在。单独的 `xiangqi-advisor-extension-vX.Y.Z.zip` 只含浏览器扩展，仍需另行运行本机分析服务。
2. 双击 `start-xiangqi-advisor.cmd`。看到“Pikafish 象棋分析服务已启动”后，保持这个命令行窗口打开。也可以在项目目录手动执行：

   ```powershell
   py -3 xiangqi_advisor_server.py
   ```

3. 打开浏览器扩展管理页（Chrome：`chrome://extensions`；Edge：`edge://extensions`），开启“开发者模式”，点击“加载已解压的扩展程序”，选择本项目的 [`extension`](./extension) 文件夹。此前安装过油猴脚本的用户应停用或删除旧脚本，避免出现两个面板。
4. 打开或刷新[天天象棋网页版](https://h5login.qqchess.qq.com/)，登录并进入人机或真人对战棋盘。右侧应出现“Pikafish 象棋分析”面板。
5. 在面板中设置“我执”红方或黑方。“对局模式”默认自动识别；如果人机棋盘未被识别，改选“人机对局”，再点击“识别当前棋盘”。默认开启“自动跟踪”：轮到我方时，扩展会识别实战局面、请求本机分析，并在小棋盘上标出推荐走法。

扩展只请求访问天天象棋页面和本机 `127.0.0.1:8765`。关闭服务窗口会停止分析；下次使用时重新启动即可。更新扩展文件后，在扩展管理页点击“重新加载”，再刷新游戏页面。

## 发布新版本

将 [`extension/manifest.json`](./extension/manifest.json) 中的 `version` 更新为新版本号（例如 `2.0.1`），提交所有更改，然后推送对应的 `vX.Y.Z` 标签：

```powershell
git tag v2.0.1
git push origin v2.0.1
```

GitHub Actions 会验证标签与清单版本一致，自动生成两个 ZIP 和 `SHA256SUMS`，并发布到 GitHub Releases。扩展 ZIP 解压后，其根目录就是 `manifest.json`，可直接在扩展管理页加载；Windows 完整包还包含本机服务、Pikafish 和使用说明。没有扩展商店签名密钥，因此发布的是可加载的 ZIP，而不是 `.crx`。也可以在本地运行 `py -3 scripts/package_release.py --tag v2.0.1` 预先检查包内容。

## 面板使用方法

| 功能            | 用法                                                                                                |
| --------------- | --------------------------------------------------------------------------------------------------- |
| 我执            | 选择自己执红棋还是黑棋。真人对战的识别结果与设置不一致时，按面板提示调整。                          |
| 对局模式        | 默认自动识别；识别失败时可手动选“人机对局”或“真人对局”。选择会保存在当前浏览器中。             |
| 自动跟踪        | 自动读取实战棋盘。游戏落子动画期间会等待局面稳定。                                                  |
| 思考时间        | 可选 2、5、10 秒。时间越长通常搜索越深入，但不保证每一步都更好。                                    |
| 识别当前棋盘    | 立即重新读取游戏中的棋子与朝向。                                                                    |
| 分析            | 对当前面板中的 FEN 请求一次分析，只显示评分最高的一条推荐着法。                                     |
| 自动落子        | **默认关闭。** 开启后，仅对已识别且再次核对过的我方实战回合，在游戏画布上点击推荐走法的起点和终点。 |
| 局面 FEN / 载入 | 粘贴 FEN 后点击“载入”，可分析自行指定的局面。                                                       |
| 小棋盘与棋子栏  | 点击交点，再点击下方棋子放置；右键交点或用“清空格”移除棋子。                                        |

小棋盘按游戏画面中的朝向显示，推荐箭头标出起点和终点。棋盘翻转后，自动跟踪会同步更新显示方向。

### 手动分析局面

如果要分析与当前实战不同的局面，先关闭“自动跟踪”，再粘贴 FEN 并点击“载入”，或直接在小棋盘上编辑。核对“轮到”红方或黑方后点击“分析”。FEN 使用 10 行、每行 9 个交点；大写字母表示红棋，小写字母表示黑棋，末尾的 `w` / `b` 分别表示红方 / 黑方行棋。

### 自动落子

自动落子是可选功能。扩展会在引擎返回推荐后再次核对棋盘、行棋方、我方棋色和局面内容；无法确认这些信息时不会点击。若游戏没有接受点击，面板会取消勾选“自动落子”并显示原因。此时可以手动落子，确认棋盘状态后再开启。

真人对战的回合由游戏中的双方计时状态判断。对局尚未开始、暂停、结束，或无法确定我方棋色与行棋方时，自动分析和落子会等待。自行输入的非实战局面可以手动分析，不会触发自动落子。

## 项目结构

| 文件                                                       | 作用                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------- |
| [`extension/manifest.json`](./extension/manifest.json) | 浏览器扩展入口，限定注入页面与本机服务权限。 |
| [`extension/main.js`](./extension/main.js) | 读取棋盘、绘制面板和可选的自动落子。 |
| [`extension/bridge.js`](./extension/bridge.js) | 在页面逻辑与扩展后台之间转发分析请求。 |
| [`extension/service-worker.js`](./extension/service-worker.js) | 向本机服务发送分析请求。 |
| [`scripts/package_release.py`](./scripts/package_release.py) | 构建并校验发布用 ZIP 包。 |
| [`.github/workflows/release.yml`](./.github/workflows/release.yml) | 推送版本标签后自动发布 GitHub Release。 |
| [`start-xiangqi-advisor.cmd`](./start-xiangqi-advisor.cmd) | Windows 启动器。                                                  |
| [`xiangqi_advisor_server.py`](./xiangqi_advisor_server.py) | 监听 `127.0.0.1:8765` 的本机 HTTP 服务。                          |
| [`pikafish_bridge.py`](./pikafish_bridge.py)               | 管理 Pikafish 进程，通过 UCI 协议提交局面并读取结果。             |
| [`third_party/pikafish`](./third_party/pikafish/README.md) | Pikafish 程序、NNUE 网络及其许可文件。                            |
| [`象棋分析助手-使用说明.md`](./象棋分析助手-使用说明.md)   | 简版使用说明。                                                    |

数据流程：网页棋盘 → 扩展页面脚本 → 扩展后台 → 本机 Python 服务 → Pikafish → 面板中的推荐走法。搜索运行在本机引擎进程中，不占用网页的分析主线程。服务只监听 `127.0.0.1`，提供 `GET /health` 和 `POST /analyze`。

## 常见问题

| 现象                            | 处理方法                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------ |
| 面板显示“分析服务未连接”        | 确认启动器窗口仍在运行；可在本机打开 `http://127.0.0.1:8765/health` 检查服务。             |
| 启动器提示找不到 `py` 或 Python | 安装 Python 3.10+ 及 Windows Python Launcher，或用正确的 Python 命令在项目目录启动服务。   |
| 提示缺少 Pikafish 或 NNUE 文件  | 重新下载完整项目目录，核对 `third_party/pikafish` 下的两个文件。                           |
| 端口 `8765` 已被占用            | 关闭先前启动的分析服务窗口，再运行启动器。                                                 |
| 没有找到棋盘或棋子正在移动      | 确认已进入对局，在“对局模式”中选对应模式，等待落子动画结束后点击“识别当前棋盘”。           |
| 真人对战提示“我执”不一致        | 按提示把“我执”改为实际棋色。                                                               |
| 自动落子已暂停                  | 根据面板错误信息检查游戏是否仍在进行；先手动落子，之后按需重新勾选。                       |
| 网页里看不到面板                | 确认扩展已启用、当前网址是 `https://h5login.qqchess.qq.com/`，然后刷新页面。               |

游戏更新可能改变棋盘节点和计时状态的读取方式。如果新版页面无法识别，请记录面板错误、对战模式和棋盘截图，便于定位兼容问题。

## 第三方组件

本项目附带的 Pikafish 程序与 NNUE 网络来自 [Pikafish 官方项目](https://github.com/official-pikafish/Pikafish)。其说明与许可文件分别见 [`third_party/pikafish/README.md`](./third_party/pikafish/README.md)、[`Copying.txt`](./third_party/pikafish/Copying.txt) 和 [`NNUE-License.md`](./third_party/pikafish/NNUE-License.md)。
