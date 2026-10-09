# Puts the visitka on the server: build, upload, check. Nothing is deleted on the server, only files are replaced.
# The address comes from the environment, never from the repo:
#   $env:AVR_SERVER = 'user@host'; $env:AVR_KEY = "$HOME\.ssh\<key>"; .\sites\main\deploy.ps1
$ErrorActionPreference = 'Stop'
if (-not $env:AVR_SERVER) { throw 'Set AVR_SERVER (user@host) first.' }
$key = if ($env:AVR_KEY) { $env:AVR_KEY } else { "$HOME\.ssh\id_ed25519" }
Set-Location $PSScriptRoot

node build.mjs; if ($LASTEXITCODE) { throw 'build failed' }
node check.mjs; if ($LASTEXITCODE) { throw 'check failed' }

$remote = 'mkdir -p /var/www/avthsr.space && tar xzf - -C /var/www/avthsr.space && chown -R www-data:www-data /var/www/avthsr.space && find /var/www/avthsr.space -type f -exec chmod 644 {} + && curl -fsS -o /dev/null https://avthsr.space/ && echo deployed'
# tar goes through cmd, because PowerShell 5 would put a byte-order mark into a piped binary stream
cmd /c "tar czf - -C dist . | ssh -i `"$key`" -o IdentitiesOnly=yes -o BatchMode=yes $($env:AVR_SERVER) `"$remote`""
if ($LASTEXITCODE) { throw 'upload failed' }
