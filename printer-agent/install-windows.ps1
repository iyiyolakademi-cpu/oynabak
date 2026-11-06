$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName Microsoft.VisualBasic
function Info($message) { [System.Windows.Forms.MessageBox]::Show($message,'OynaBak Yazici Kurulumu') | Out-Null }
function Ask($message,$default='') { return [Microsoft.VisualBasic.Interaction]::InputBox($message,'OynaBak Kurulum',$default) }
function AskToken {
 $form=New-Object System.Windows.Forms.Form
 $form.Text='OynaBak - Cihaz Anahtari';$form.Width=560;$form.Height=170;$form.StartPosition='CenterScreen'
 $label=New-Object System.Windows.Forms.Label;$label.Text='Yonetici panelindeki cihaz anahtarini yapistirin';$label.Left=12;$label.Top=15;$label.Width=530
 $input=New-Object System.Windows.Forms.TextBox;$input.Left=12;$input.Top=42;$input.Width=520;$input.UseSystemPasswordChar=$true
 $button=New-Object System.Windows.Forms.Button;$button.Text='Kaydet';$button.Left=426;$button.Top=79
 $button.DialogResult=[System.Windows.Forms.DialogResult]::OK
 $form.Controls.AddRange(@($label,$input,$button));$form.AcceptButton=$button
 if($form.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK){return ''}
 return $input.Text.Trim()
}
try {
 $node=(Get-Command node.exe -ErrorAction SilentlyContinue).Source
 if(-not $node) {
  Info 'Node.js yuklu degil. Acilan resmi siteden LTS surumunu kurun ve tekrar baslatin.'
  Start-Process 'https://nodejs.org/en/download'
  exit 1
 }
 $token=AskToken
 if($token -notmatch '^obp_[0-9a-f]{64}$'){throw 'Gecerli bir cihaz anahtari gerekli. Yonetici panelinden olusturun.'}
 $ip=Ask 'Yazici IPv4 adresini girin (ornek: 192.168.1.100)'
 if($ip -notmatch '^[0-9.]+$'){throw 'Yazici IP adresi gecersiz.'}
 $portText=Ask 'Yazicinin TCP portu' '9100'
 $port=0
 if(-not [int]::TryParse($portText,[ref]$port) -or $port -lt 1 -or $port -gt 65535){throw 'TCP port gecersiz.'}
 $paper=Ask 'Kagit genisligi: 58 veya 80' '80'
 if($paper -notin @('58','80')){throw '58 veya 80 secilmeli.'}
 $root=Join-Path $env:LOCALAPPDATA 'OynaBak'
 New-Item -ItemType Directory -Force -Path $root | Out-Null
 $config=Join-Path $root 'printer.json'
 [ordered]@{device_token=$token;printer_host=$ip;printer_port=$port;paper_width_mm=[int]$paper}|ConvertTo-Json|Set-Content -LiteralPath $config -Encoding utf8
 $acl=Get-Acl -LiteralPath $config
 $acl.SetAccessRuleProtection($true,$false)
 foreach($rule in @($acl.Access)){$acl.RemoveAccessRuleSpecific($rule)}
 $sid=[System.Security.Principal.WindowsIdentity]::GetCurrent().User
 $rule=New-Object System.Security.AccessControl.FileSystemAccessRule($sid,'FullControl','Allow')
 $acl.AddAccessRule($rule);Set-Acl -LiteralPath $config -AclObject $acl
 $source=Join-Path $PSScriptRoot 'print-agent.mjs'
 if(-not (Test-Path $source)){throw 'print-agent.mjs bulunamadi.'}
 $agent=Join-Path $root 'print-agent.mjs'
 Copy-Item -LiteralPath $source -Destination $agent -Force
 $result=[System.Windows.Forms.MessageBox]::Show('Simdi yazicidan Turkce test fisi cikarmak ister misiniz?','OynaBak Yazici Testi','YesNo','Question')
 if($result -eq [System.Windows.Forms.DialogResult]::Yes) {
  $testOutput=& $node $agent --test-printer 2>&1
  if($LASTEXITCODE -ne 0){throw ('Yazici testi basarisiz: '+($testOutput -join ' '))}
  Info 'Test komutu tamamlandi. Yazicidan kagit ciktigini ve Turkce karakterlerin dogru oldugunu kontrol edin.'
 }
 $launcher=Join-Path $root 'start-printer.ps1'
 $lines=@(
  '$ErrorActionPreference="Continue"',
  '$folder=Join-Path $env:LOCALAPPDATA "OynaBak"',
  '$log=Join-Path $folder "printer.log"',
  'if((Test-Path $log) -and (Get-Item $log).Length -gt 2097152){Move-Item $log (Join-Path $folder "printer.old.log") -Force}',
  ('& "'+$node+'" "'+$agent+'" --live *>> $log')
 )
 $lines|Set-Content -LiteralPath $launcher -Encoding utf8
 $shell=New-Object -ComObject WScript.Shell
 $startup=[Environment]::GetFolderPath('Startup')
 $shortcut=$shell.CreateShortcut((Join-Path $startup 'OynaBak Yazici.lnk'))
 $shortcut.TargetPath=(Get-Command powershell.exe).Source
 $quote=[char]34
 $shortcut.Arguments='-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File '+$quote+$launcher+$quote
 $shortcut.WorkingDirectory=$root
 $shortcut.WindowStyle=7
 $shortcut.Save()
 Start-Process -FilePath 'powershell.exe' -ArgumentList $shortcut.Arguments -WindowStyle Hidden
 Info 'OynaBak yazdirma servisi kuruldu. Windows oturumuyla otomatik baslayacak. Yonetici paneli otomatik baskiyi etkinlestirmeden fis basmaz.'
}catch {
 [System.Windows.Forms.MessageBox]::Show($_.Exception.Message,'Kurulum Hatasi','OK','Error') | Out-Null
 exit 1
}
