# Escudos dos clubes

A resolução de escudos fica centralizada em `src/config/teamLogos.js`.

A versão atual utiliza URLs de escudos para os clubes já mapeados e um fallback de iniciais quando um clube ainda não possui logo conhecido.

Para adicionar um novo clube, altere apenas `TEAM_ENTRIES` em `src/config/teamLogos.js`. Não espalhe caminhos ou URLs pelos componentes.

`TeamCrest` reserva o espaço da imagem, usa `object-fit: contain` e volta automaticamente para as iniciais se a imagem falhar.
