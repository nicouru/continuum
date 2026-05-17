# Continuum Lexical Providers

Continuum usa este paquete para consultar informacion lexical sin acoplar la UI
del editor a una fuente concreta.

## Fuente inicial

La fuente inicial es RAE API (`https://rae-api.com/api/words`). Es una API no
oficial para consultar datos del DLE de forma programatica. El proyecto declara
uso gratuito con limites y claves gratuitas, pero tambien aclara que no esta
vinculado con la RAE y que el contenido lexicografico pertenece a la Real
Academia Espanola.

En la app de Mac se puede configurar una clave opcional con:

```bash
VITE_RAE_API_KEY=...
```

Sin clave, Continuum usa el modo anonimo de la API.

## Cambio futuro de fuente

La UI consume `LexicalProvider`, no `RaeLexicalProvider`. Para cambiar o combinar
fuentes, agregar otro proveedor y sumarlo a `createLexicalProviderChain`.
