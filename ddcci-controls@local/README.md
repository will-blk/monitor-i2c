# DDC/CI Monitor Controls

Applet Cinnamon baseado no `ddcci-multi-monitor@tim-we`, com controles por monitor para:

- brilho (`VCP 0x10`);
- contraste (`VCP 0x12`);
- preset de cor (`VCP 0x14`);
- entrada (`VCP 0x60`);
- modo de imagem (`VCP 0xDC`);
- energia (`VCP 0xD6`).

Os sliders são atualizados com os valores lidos do monitor ao abrir o applet. A alteração é enviada ao soltar o controle; durante a escrita e a leitura de confirmação os sliders ficam temporariamente bloqueados.

No topo da seção de cada monitor aparecem, em modo somente leitura, o modelo, o barramento I²C e a versão MCCS.

O applet lê as capacidades reais com `ddcutil capabilities`, portanto o submenu de modo de imagem só aparece quando o monitor anuncia o recurso `0xDC`.

## Dependências

```bash
sudo apt install ddcutil i2c-tools
sudo usermod -aG i2c "$USER"
```

Saia e entre novamente na sessão depois de adicionar o usuário ao grupo `i2c`.

## Vincular ao diretório de widgets do Mint

O Cinnamon/Mint carrega widgets (applets) de `~/.local/share/cinnamon/applets`.
Execute na raiz do repositório:

```bash
mkdir -p ~/.local/share/cinnamon/applets
ln -sfn "$(pwd)/ddcci-controls@local/files/ddcci-controls@local" \
  ~/.local/share/cinnamon/applets/ddcci-controls@local
readlink -f ~/.local/share/cinnamon/applets/ddcci-controls@local
```

Depois adicione **DDC/CI Monitor Controls** em Configurações do sistema → Applets.
