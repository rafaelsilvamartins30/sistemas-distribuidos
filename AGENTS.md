# Regras obrigatórias para o Codex

- Respeite a arquitetura documentada e os limites entre serviços. Corrija violações de arquitetura na origem.
- Cubra regras de negócio novas ou alteradas com testes proporcionais ao risco.
- Execute os checks dos componentes afetados antes de concluir. Use `make ci` para mudanças transversais e informe verificações bloqueadas.
- Corrija os problemas apontados. Não ignore, desabilite ou enfraqueça checks para simular sucesso.
- Reutilize o código existente e evite abstrações desnecessárias.
- Documente mudanças de contratos e decisões arquiteturais junto à implementação.
- Faça commit ou push somente com autorização.
