# 🎬 Painel de Últimos Lançamentos IPTV (Online com GitHub Pages)

Este projeto consulta a lista IPTV e exibe os **últimos filmes e séries adicionados** com a data e hora exatas de inclusão, sinopse, pôster e avaliação.

Ele está preparado para rodar **100% online e gratuito** através do **GitHub Pages** e ser atualizado automaticamente a cada 3 horas pelo **GitHub Actions**.

---

## 🚀 Passo a Passo: Como Colocar no Ar em 3 Minutos

### Passo 1: Criar o Repositório no GitHub
1. Acesse sua conta no [GitHub](https://github.com) e clique em **New repository** (Novo repositório).
2. Dê um nome para o repositório (exemplo: `painel-iptv`).
3. Deixe o repositório como **Public** (Público) para usar o GitHub Pages gratuitamente.
4. Clique em **Create repository**.

---

### Passo 2: Subir os Arquivos
Você pode subir de duas formas:

#### Opção A (Direto pelo site do GitHub - Sem instalar nada):
1. Na página do seu repositório recém-criado, clique no link **uploading an existing file**.
2. Arraste todos os arquivos e pastas desta pasta (`iptv-ultimos-lancamentos`):
   - `.github/workflows/update.yml` *(importante: manter a pasta .github)*
   - `index.html`
   - `update.py`
   - `data.js`
   - `iptv_dados.json`
3. Clique no botão verde **Commit changes**.

#### Opção B (Pelo terminal Git):
```bash
git init
git add .
git commit -m "feat: painel iptv inicial"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/painel-iptv.git
git push -u origin main
```

---

### Passo 3: Ativar o GitHub Pages (Gerar o Link Online)
1. No seu repositório no GitHub, clique na aba **Settings** (Configurações) no topo.
2. No menu lateral esquerdo, clique em **Pages**.
3. Em **Build and deployment** -> **Branch**:
   - Selecione a branch `main` e a pasta `/ (root)`.
   - Clique em **Save**.
4. Em cerca de 1 a 2 minutos, o GitHub exibirá o link público no topo da página:
   > 🌐 **`https://seu-usuario.github.io/painel-iptv/`**

---

### Passo 4: Habilitar Permissão de Escrita para o Robô (GitHub Actions)
Para que o robô consiga atualizar os arquivos sozinho a cada 3 horas:
1. No GitHub, ainda em **Settings**, clique em **Actions** -> **General** no menu lateral.
2. Role até a seção **Workflow permissions**.
3. Marque a opção: **Read and write permissions**.
4. Clique em **Save**.

---

## ⚡ Como Funciona a Atualização Automática

- **Agendamento**: O robô roda automaticamente a cada 3 horas via GitHub Actions.
- **Detecção de Novidades**: Ele compara os títulos antigos com os novos. Qualquer novo filme ou série ganha a tag vermelha **NOVO** na tela.
- **Atualizar na Hora (Manualmente)**:
  1. Vá até a aba **Actions** no seu repositório do GitHub.
  2. Clique em **Atualizar Catálogo IPTV** na barra lateral.
  3. Clique no botão **Run workflow** -> **Run workflow**. Em menos de 1 minuto o site estará 100% atualizado!

---

## 💻 Como Rodar Localmente no seu PC (Opcional)
Se preferir rodar localmente no computador:
1. Dê um duplo clique no arquivo `iniciar.bat`.
2. O navegador abrirá automaticamente em `http://localhost:5050`.
