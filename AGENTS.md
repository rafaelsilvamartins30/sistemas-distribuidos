# Regras obrigatórias para o Codex

## Prioridade imediata: versão funcional local

- A meta é fechar uma versão mínima que funcione de ponta a ponta localmente. Priorize fluxos utilizáveis e integração real; adie polimento, casos periféricos e funcionalidades que não sejam necessárias para esse fluxo.
- Se o escopo ameaçar essa meta, simplifique ou corte o que for secundário e registre claramente o que ficou para depois. Preserve os limites entre serviços e as regras de segurança aprovadas.
- Bancos, volumes e dados de demonstração locais são descartáveis. Você tem autorização permanente para apagar, recriar e repovoar bancos e volumes do Compose local quando isso destravar ou simplificar o desenvolvimento; não precisa pedir confirmação. Não preserve dados locais como requisito de compatibilidade. Nunca aplique isso a produção, ambientes compartilhados ou serviços externos.
- Ao apagar dados locais, informe isso no resumo da tarefa. Prefira validar que o sistema sobe com banco limpo e fluxo principal funcional.
- Em tarefas pequenas, rode checks focados e um smoke test relevante. Não rode pipeline completo por padrão. Use `make ci` quando a mudança atravessar serviços/contratos e o check integrado trouxer validação necessária, ou quando o usuário pedir; se estiver bloqueado, informe e continue com as verificações focadas disponíveis.

- Respeite a arquitetura documentada e os limites entre serviços. Corrija violações de arquitetura na origem.
- Cubra regras de negócio novas ou alteradas com testes proporcionais ao risco.
- Execute os checks focados dos componentes afetados antes de concluir e informe verificações bloqueadas.
- Corrija os problemas apontados. Não ignore, desabilite ou enfraqueça checks para simular sucesso.
- Reutilize o código existente e evite abstrações desnecessárias.
- Documente mudanças de contratos e decisões arquiteturais junto à implementação.
- Faça commit ou push somente com autorização.
