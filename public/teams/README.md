# Escudos dos clubes

A resolução de escudos fica centralizada em `src/config/teamLogos.js`.

Os escudos podem ser arquivos locais em `public/teams/` ou URLs externas. O componente mostra as iniciais como fallback se o escudo não estiver mapeado ou se a imagem falhar.

Para adicionar um novo clube, coloque o arquivo em `public/teams/` e inclua nome, caminho e aliases em `TEAM_ENTRIES` em `src/config/teamLogos.js`. Não espalhe caminhos ou URLs pelos componentes.

`TeamCrest` reserva o espaço da imagem, usa `object-fit: contain` e volta automaticamente para as iniciais se a imagem falhar.
