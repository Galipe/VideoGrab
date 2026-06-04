' VideoGrab — start_hidden.vbs
' Inicia o servidor local TOTALMENTE OCULTO (sem nenhuma janela), via autostart.bat.
' Usado pelo atalho da pasta de Inicializacao do Windows.
Dim sh, fso, here
Set sh  = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
here = fso.GetParentFolderName(WScript.ScriptFullName)
sh.CurrentDirectory = here
' 0 = janela oculta ; False = nao espera terminar
sh.Run "cmd /c """ & here & "\autostart.bat""", 0, False
