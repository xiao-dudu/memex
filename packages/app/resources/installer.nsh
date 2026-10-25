; Memex 自定义安装脚本
;
; 背景：应用开启了「关闭窗口时最小化到托盘」，用户关掉窗口后进程仍在后台，
; 占用 Memex.exe 及其依赖 DLL。覆盖安装时旧卸载程序删不掉这些文件，
; NSIS 会抛出「Failed to uninstall old application files」错误码 2。
;
; 这里在安装/卸载开始前静默结束进程，避免整个升级流程失败。
;
; 注意：必须用 /IM 按镜像名匹配，不能加 /T。
; 应用内「立即更新」是用 spawn(detached) 启动安装器的，安装器本身是
; Memex.exe 的子进程，/T 会把安装器自己也杀掉，表现为「程序关了但没装成」。
; 而渲染进程、GPU 进程的镜像名同样是 Memex.exe，/IM 已能一并结束，无需 /T。

!macro customInit
  DetailPrint "正在关闭正在运行的 Memex…"
  nsExec::Exec 'taskkill /F /IM "Memex.exe"'
  Pop $0
  Sleep 500
!macroend

!macro customUnInit
  DetailPrint "正在关闭正在运行的 Memex…"
  nsExec::Exec 'taskkill /F /IM "Memex.exe"'
  Pop $0
  Sleep 500
!macroend
