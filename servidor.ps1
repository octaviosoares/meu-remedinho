$port = 8000

# Obter o IP local ativo na rede Wi-Fi/Ethernet
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.InterfaceAlias -notlike "*Loopback*" }).IPAddress | Select-Object -First 1
if (-not $ip) { $ip = "127.0.0.1" }

# Iniciar o servidor usando socket TCP bruto (evita o "Acesso negado" do HTTPListener no Windows)
$server = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $port)

try {
    $server.Start()
} catch {
    Write-Host "Erro ao iniciar o servidor TCP: $_"
    Write-Host "Verifique se a porta $port já não está sendo usada por outro aplicativo."
    exit
}

Write-Host "===================================================="
Write-Host "          MEU REMEDINHO - SERVIDOR POWERSHELL       "
Write-Host "===================================================="
Write-Host "1. Certifique-se de que o celular está no mesmo Wi-Fi do PC."
Write-Host "2. No navegador do seu celular, digite o link abaixo:"
Write-Host ""
Write-Host "   👉  http://$ip`:$port  👈"
Write-Host ""
Write-Host "3. No menu do Chrome/Safari do celular, toque em:"
Write-Host "   'Instalar aplicativo' ou 'Adicionar à Tela de Início'."
Write-Host "===================================================="
Write-Host "Pressione CTRL + C no teclado para desligar o servidor."
Write-Host "===================================================="

while ($server.Active) {
    try {
        $client = $server.AcceptTcpClient()
        $stream = $client.GetStream()
        
        # Ler a requisição HTTP do navegador
        $buffer = New-Object Byte[] 4096
        $bytesRead = $stream.Read($buffer, 0, $buffer.Length)
        if ($bytesRead -gt 0) {
            $requestText = [System.Text.Encoding]::UTF8.GetString($buffer, 0, $bytesRead)
            
            # Extrair o caminho solicitado (ex: GET /index.html HTTP/1.1)
            if ($requestText -match "GET (\S+) HTTP") {
                $urlPath = $Matches[1]
                # Remover parâmetros de query (ex: /index.html?v=1.0)
                $urlPath = $urlPath.Split('?')[0]
                
                if ($urlPath -eq "/") { $urlPath = "/index.html" }
                
                # Caminho físico do arquivo
                $filePath = Join-Path $PSScriptRoot $urlPath.TrimStart('/')

                if (Test-Path $filePath -PathType Leaf) {
                    # Definir o MIME-Type correto para o navegador processar os estilos e scripts
                    $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                    $contentType = switch ($ext) {
                        ".html" { "text/html; charset=utf-8" }
                        ".css"  { "text/css; charset=utf-8" }
                        ".js"   { "application/javascript; charset=utf-8" }
                        ".png"  { "image/png" }
                        ".json" { "application/json; charset=utf-8" }
                        default { "application/octet-stream" }
                    }
                    
                    $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
                    
                    # Cabeçalhos de resposta HTTP
                    $header = "HTTP/1.1 200 OK`r`n" +
                              "Content-Type: $contentType`r`n" +
                              "Content-Length: $($fileBytes.Length)`r`n" +
                              "Connection: close`r`n`r`n"
                    $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                    
                    $stream.Write($headerBytes, 0, $headerBytes.Length)
                    $stream.Write($fileBytes, 0, $fileBytes.Length)
                } else {
                    # Arquivo não encontrado (404)
                    $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes("Arquivo nao encontrado: $urlPath")
                    $header = "HTTP/1.1 404 Not Found`r`n" +
                              "Content-Type: text/plain; charset=utf-8`r`n" +
                              "Content-Length: $($bodyBytes.Length)`r`n" +
                              "Connection: close`r`n`r`n"
                    $headerBytes = [System.Text.Encoding]::UTF8.GetBytes($header)
                    
                    $stream.Write($headerBytes, 0, $headerBytes.Length)
                    $stream.Write($bodyBytes, 0, $bodyBytes.Length)
                }
            }
        }
        $stream.Close()
        $client.Close()
    } catch {
        # Evita crash do servidor por conexões interrompidas
    }
}
