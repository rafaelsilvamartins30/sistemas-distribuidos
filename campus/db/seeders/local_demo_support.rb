# frozen_string_literal: true

# Shares stable keys, source disclaimers and local seed input validation.
module LocalDemoSeedSupport
  NAMESPACE = '6bc5849c-694a-4cef-8839-6b9ef7ad5cf4'
  REFERENCE_INFO = [
    'Registro de referência institucional para demonstração local.',
    'A atividade atual não foi verificada; este registro não confirma funcionamento nem vínculo administrativo.'
  ].join(' ').freeze
  CATALOG_PATH = Rails.root.join('db/seed_data/ufla_catalogo_referencia_2026-11-18.json')
  ACCOUNTS_PATH = Pathname.new(ENV.fetch('LOCAL_DEMO_ACCOUNTS_FILE',
                                         Rails.root.join('../config/local-demo-accounts.json').to_s))
  ACCOUNT_USERNAMES = %w[
    unir.admin unir.departamento unir.entidade unir.professor.aprovado unir.professor.novo
    unir.aluno1 unir.aluno2 unir.aluno3
  ].freeze
  CATALOG_COUNTS = {
    'academic_units' => 9,
    'departments' => 32,
    'undergraduate_course_references' => 53,
    'extension_entities' => 107,
    'other_student_organizations' => 5
  }.freeze
  UNIVERSITY_ATTRIBUTES = {
    name: 'Universidade Federal de Lavras', acronym: 'UFLA',
    description: 'Universidade Federal de Lavras (UFLA).',
    general_info_markdown: 'Ambiente local de demonstração com catálogo institucional de referência da UFLA.',
    current_term: '2026/2',
    links: [
      { label: 'Unidades acadêmicas', url: 'https://ufla.br/sobre/administracao/unidades-academicas' },
      { label: 'Calendário escolar da PROGRAD', url: 'https://prograd.ufla.br/calendario-escolar/' }
    ]
  }.freeze

  module_function

  def stable_id(name)
    namespace = [NAMESPACE.delete('-')].pack('H*')
    digest = Digest::SHA1.new
    digest.update(namespace)
    digest.update(name.to_s.encode('UTF-8'))
    versioned_id(digest.digest.bytes.first(16))
  end

  def reference_markdown(source_url)
    "#{REFERENCE_INFO}\n\nFonte: [registro institucional](#{source_url})."
  end

  def catalog
    data = JSON.parse(CATALOG_PATH.read)
    CATALOG_COUNTS.each do |key, count|
      actual = data.fetch(key).length
      raise "Catálogo inválido: #{key}=#{actual}, esperado #{count}" unless actual == count
    end
    data
  end

  def accounts
    ensure_accounts_file

    loaded = JSON.parse(ACCOUNTS_PATH.read).fetch('accounts')
    validate_account_names(loaded)

    loaded
  end

  def ensure_accounts_file
    return if ACCOUNTS_PATH.file?

    raise "Arquivo local de contas ausente: #{ACCOUNTS_PATH}. Execute scripts/prepare-local-demo-accounts.py."
  end

  def validate_account_names(accounts)
    return if accounts.keys.sort == ACCOUNT_USERNAMES.sort

    raise 'Arquivo local deve conter exatamente as 8 contas de demonstração esperadas.'
  end

  def versioned_id(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x50
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    hex = bytes.pack('C*').unpack1('H*')
    [hex[0, 8], hex[8, 4], hex[12, 4], hex[16, 4], hex[20, 12]].join('-')
  end
  private_class_method :versioned_id
end
