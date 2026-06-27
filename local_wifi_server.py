import socket
import http.server
import socketserver

PORT = 8000

def get_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        # Não precisa ser alcançável, serve apenas para pegar o IP local da interface ativa
        s.connect(('10.255.255.255', 1))
        IP = s.getsockname()[0]
    except Exception:
        IP = '127.0.0.1'
    finally:
        s.close()
    return IP

ip = get_ip()

print("====================================================")
print("             MEU REMEDINHO - SERVIDOR LOCAL         ")
print("====================================================")
print(f"1. Certifique-se de que o celular está no mesmo Wi-Fi do PC.")
print(f"2. No navegador do seu celular, digite o link abaixo:")
print(f"\n   👉  http://{ip}:{PORT}  👈\n")
print("3. No menu do Chrome/Safari do celular, toque em:")
print("   'Instalar aplicativo' ou 'Adicionar à Tela de Início'.")
print("====================================================")
print("Pressione CTRL + C para desligar o servidor.")
print("====================================================")

Handler = http.server.SimpleHTTPRequestHandler
# Configura o servidor para escutar em todas as interfaces
socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), Handler) as httpd:
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor desligado com sucesso.")
