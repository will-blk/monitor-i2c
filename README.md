# DDC/CI Monitor Controls para Cinnamon

Applet do Cinnamon para controlar monitores externos por DDC/CI usando
`ddcutil`.

## Controles

O applet detecta os recursos anunciados por cada monitor e disponibiliza:

- brilho;
- contraste;
- preset de cor;
- entrada HDMI/DisplayPort;
- modo de imagem;
- modo de energia.

Também exibe, no topo da seção de cada monitor, o modelo detectado, o
barramento I²C e a versão MCCS. Os valores dos sliders são lidos novamente
após cada alteração; enquanto o monitor confirma a operação, os controles
ficam temporariamente bloqueados.

## Requisitos

Linux Mint/Cinnamon, `ddcutil`, `i2c-tools` e um monitor conectado por uma
porta que transporte DDC/CI, normalmente HDMI ou DisplayPort.

Instale as dependências:

```bash
sudo apt update
sudo apt install ddcutil i2c-tools
```

Permita que seu usuário acesse os dispositivos I²C:

```bash
sudo usermod -aG i2c "$USER"
sudo modprobe i2c-dev
```

Saia da sessão gráfica e entre novamente para que o grupo `i2c` seja aplicado.
Confirme a detecção antes de instalar o applet:

```bash
ddcutil detect
ddcutil capabilities
```

Se aparecer `Permission denied` para `/dev/i2c-*`, confirme que a sessão foi
reiniciada e que `id -nG` inclui `i2c`.

## Instalação do widget/applet

A estrutura compatível com Cinnamon Spices está em
`ddcci-controls@local/files/ddcci-controls@local`. Para instalar a versão do
projeto sem copiar os arquivos, crie um link simbólico:

```bash
mkdir -p ~/.local/share/cinnamon/applets
ln -sfn "$(pwd)/ddcci-controls@local/files/ddcci-controls@local" \\
  ~/.local/share/cinnamon/applets/ddcci-controls@local
```

O comando acima deve ser executado na raiz deste repositório. Em seguida:

1. Abra **Configurações do sistema → Applets**.
2. Adicione **DDC/CI Monitor Controls** ao painel.
3. Se o applet já estiver instalado, recarregue o Cinnamon com `Alt+F2`,
   depois `r` e Enter, ou remova e adicione o applet novamente.

## Atualizar uma instalação existente

Como a instalação usa link simbólico, basta atualizar os arquivos do projeto.
Depois recarregue o Cinnamon para que o código seja lido novamente:

```bash
git pull
```

Se o link estiver apontando para outro local, recrie-o com o comando da seção
de instalação.

## Remover

Remova somente o link simbólico; os arquivos do projeto permanecerão intactos:

```bash
rm ~/.local/share/cinnamon/applets/ddcci-controls@local
```

## Desenvolvimento

O applet segue a estrutura de pacotes do repositório Cinnamon Spices:

```text
ddcci-controls@local/
├── info.json
├── README.md
├── screenshot.png
└── files/
    └── ddcci-controls@local/
        ├── applet.js
        ├── icon.png
        └── metadata.json
```

Para verificar a sintaxe do código:

```bash
node --check ddcci-controls@local/files/ddcci-controls@local/applet.js
python3 -m json.tool ddcci-controls@local/info.json >/dev/null
python3 -m json.tool ddcci-controls@local/files/ddcci-controls@local/metadata.json >/dev/null
```
