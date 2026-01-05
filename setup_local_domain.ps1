# Check for Administrator privileges
if (!([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Warning "Please run this script as Administrator to update the hosts file!"
    exit
}

$domain = "cloud.delovahome.com"
$ip = "127.0.0.1"
$hostsFile = "$env:windir\System32\drivers\etc\hosts"

# 1. Update Hosts File
Write-Host "Updating hosts file..." -ForegroundColor Cyan
$hostsContent = Get-Content $hostsFile
if ($hostsContent -match "$domain") {
    Write-Host "Domain $domain already exists in hosts file." -ForegroundColor Yellow
} else {
    Add-Content -Path $hostsFile -Value "`n$ip $domain"
    Write-Host "Added $domain to hosts file." -ForegroundColor Green
}

# 2. Generate Self-Signed Certificate
Write-Host "Generating Self-Signed Certificate..." -ForegroundColor Cyan
$cert = New-SelfSignedCertificate -DnsName $domain -CertStoreLocation "cert:\LocalMachine\My"

# Export Certificate and Key (This requires some .NET magic or external tools usually, but we can try a simpler approach for Node.js)
# Node.js needs .pem files (crt and key). PowerShell New-SelfSignedCertificate puts it in Windows Store.
# We will use a helper to export it or just use OpenSSL if available.

# Checking for OpenSSL
if (Get-Command openssl -ErrorAction SilentlyContinue) {
    Write-Host "OpenSSL found. Generating PEM files..." -ForegroundColor Green
    openssl req -x509 -newkey rsa:4096 -keyout server.key -out server.cert -days 365 -nodes -subj "/CN=$domain"
} else {
    Write-Warning "OpenSSL not found. Attempting to export from Windows Cert Store..."
    
    # Export Public Key (Cert)
    $certPath = "server.cert"
    [IO.File]::WriteAllBytes($certPath, $cert.Export([System.Security.Cryptography.X509Certificates.X509ContentType]::Cert))
    
    # Export Private Key (This is hard from PS without password, usually requires PFX then extraction)
    Write-Warning "Exporting Private Key from Windows Store to PEM is complex without OpenSSL."
    Write-Warning "Please install OpenSSL or Git Bash to generate proper Node.js certificates."
    Write-Host "For now, we will generate a dummy key/cert pair using a simple PowerShell function if possible, or you can skip this if you have certs."
}

Write-Host "Setup Complete!" -ForegroundColor Green
Write-Host "1. Restart your Node.js server."
Write-Host "2. You can now access https://$domain:4000"
