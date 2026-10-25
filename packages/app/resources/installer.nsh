; Memex 自定义安装脚本
;
; 背景：应用开启了「关闭窗口时最小化到托盘」，用户关掉窗口后进程仍在后台，
; 占用 Memex.exe 及其依赖 DLL。覆盖安装时旧卸载程序删不掉这些文件，
; NSIS 会抛出「Failed to uninstall old application files」错误码 2。
;
; 这里在安装/卸载开始前静默结束进程，避免整个升级流程失败。

!macro customInit
  DetailPrint "正在关闭正在运行的 Memex…"
  nsExec::Exec 'taskkill /F /IM "Memex.exe" /T'
  Pop $0
  Sleep 500
!macroend

!macro customUnInit
  DetailPrint "正在关闭正在运行的 Memex…"
  nsExec::Exec 'taskkill /F /IM "Memex.exe" /T'
  Pop $0
  Sleep 500
!macroend
