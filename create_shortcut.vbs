Set WshShell = CreateObject("WScript.Shell")

Sub CreateLnk(folder)
  On Error Resume Next
  Dim fso: Set fso = CreateObject("Scripting.FileSystemObject")
  If fso.FolderExists(folder) Then
    Dim lnk: Set lnk = WshShell.CreateShortcut(folder & "\Coding Monster.lnk")
    lnk.TargetPath = "d:\autonomus\coding-monster\node_modules\electron\dist\electron.exe"
    lnk.Arguments = "d:\autonomus\coding-monster"
    lnk.WorkingDirectory = "d:\autonomus\coding-monster"
    lnk.IconLocation = "d:\autonomus\coding-monster\node_modules\electron\dist\electron.exe,0"
    lnk.Description = "Coding Monster - AI Engineering Command Center"
    lnk.WindowStyle = 1
    lnk.Save
    WScript.Echo "Created shortcut in: " & folder
  End If
End Sub

CreateLnk WshShell.SpecialFolders("Desktop")
CreateLnk "C:\Users\user\OneDrive\Desktop"
CreateLnk "C:\Users\user\Desktop"
