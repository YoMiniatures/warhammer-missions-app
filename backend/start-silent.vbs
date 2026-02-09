Set WshShell = CreateObject("WScript.Shell")
WshShell.Run """" & Replace(WScript.ScriptFullName, "start-silent.vbs", "start-backend.bat") & """", 7, False
