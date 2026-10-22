# Piphin Vídeo

Editor de vídeo completo, módulo do [Piphin Hub](https://github.com/Ruiso-Outside/Piphin-Hub). Roda dentro do Hub (cerca de 300 KB), sem ffmpeg: decodifica e codifica pela placa de vídeo (WebCodecs).

- **Linha do tempo** com várias faixas de vídeo e de áudio: mover entre faixas, aparar as pontas, dividir (S), duplicar, apagar fechando o espaço, ímã, zoom
- **Clipes** de vídeo, áudio, imagem, texto (títulos e legendas) e cor sólida
- **Por clipe**: velocidade (0,25× a 4×), volume até 200%, sem som, separar o áudio, posição, escala, rotação, opacidade, encaixe, brilho, contraste, saturação, matiz, desfoque, preto e branco, sépia
- **Entrada e saída** (transições): esmaecer, deslizar, aproximar, afastar e cortina; no áudio, o volume sobe e desce
- **Prévia em tempo real** com vários vídeos sincronizados e áudio mixado
- **Exportação** MP4 (H.264 + AAC) ou WebM (VP9 + Opus), em 100%, 75%, 66% ou 50%, gravada direto no disco
- **Formatos de projeto**: 16:9, 9:16 (Reels/TikTok/Shorts), 1:1, 4:5, 4K; 24 a 60 quadros por segundo
- **Projeto** salvo em `.pvid`, com as mídias por caminho (e "Localizar" para arquivos movidos)
- **IA**: com o Piphin LLM, a IA importa mídias, corta, divide, apaga, edita clipes, escreve textos, muda o formato e exporta

## Mídia do Hub
Com o Piphin Hub 1.7.0 ou mais novo:
- **Usar da Mídia** (botão ao lado de Importar): músicas baixadas no Piphin Música, sons e efeitos do Piphin Som, prints e gravações do Piphin Captura e imagens do Piphin Foto.
- **Abrir no Piphin Vídeo** em qualquer módulo (ou na tela Mídia do Hub): o arquivo entra no projeto; num projeto vazio, já vai para a linha do tempo.
- **Créditos**: músicas Creative Commons pedem crédito; ao exportar, aparece o texto pronto para colar na descrição do vídeo. Música cuja licença não permite vídeos pede confirmação.
- Os vídeos exportados aparecem na Mídia.

## Estrutura

- `module/`: `module.json` (manifesto e ferramentas da IA) e `backend.js` (servidor de mídia local com Range, projetos, gravação da exportação e ponte da IA)
- `web/`: a tela; `js/` tem `core` (projeto, histórico e compositor), `media` (leitura, miniaturas, forma de onda), `preview` (reprodução), `timeline`, `export` e `ui`
- `web/vendor/mediabunny.min.js`: [Mediabunny](https://github.com/Vanilagy/mediabunny) (MPL-2.0), leitura e gravação de MP4/MOV/WebM/MKV

```
npm install
npm run vendor
npm run module
```
