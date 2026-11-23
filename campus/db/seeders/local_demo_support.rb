# frozen_string_literal: true

# Shares stable UUIDv5 keys, university defaults and local seed manifest loading.
module LocalDemoSeedSupport
  NAMESPACE = '6bc5849c-694a-4cef-8839-6b9ef7ad5cf4'
  ACCOUNTS_PATH = Pathname.new(ENV.fetch('LOCAL_DEMO_ACCOUNTS_FILE',
                                         Rails.root.join('../config/local-demo-accounts.json').to_s))
  UNIVERSITY_ATTRIBUTES = {
    name: 'Universidade Federal de Lavras',
    acronym: 'UFLA',
    description: 'Universidade Federal de Lavras (UFLA).',
    general_info_markdown: 'Plataforma universitária UNIR configurada para a Universidade Federal de Lavras (UFLA).',
    current_term: '2026/2',
    links: [
      { label: 'Portal institucional', url: 'https://ufla.br' }
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

  def manifest
    ensure_accounts_file
    JSON.parse(ACCOUNTS_PATH.read)
  end

  def seed_mode(parsed_manifest = manifest)
    raw = ENV.fetch('UNIR_SEED_MODE', nil) || parsed_manifest['mode'] || 'demo'
    mode = raw.to_s.strip.downcase
    %w[clean demo].include?(mode) ? mode : 'demo'
  end

  def accounts(parsed_manifest = manifest)
    loaded = parsed_manifest.fetch('accounts')
    raise 'Arquivo local deve conter ao menos a conta admin.' unless loaded.key?('admin')

    loaded
  end

  def ensure_accounts_file
    return if ACCOUNTS_PATH.file?

    raise "Arquivo local de contas ausente: #{ACCOUNTS_PATH}. Execute scripts/prepare-local-demo-accounts.py."
  end

  def versioned_id(bytes)
    bytes[6] = (bytes[6] & 0x0f) | 0x50
    bytes[8] = (bytes[8] & 0x3f) | 0x80
    hex = bytes.pack('C*').unpack1('H*')
    [hex[0, 8], hex[8, 4], hex[12, 4], hex[16, 4], hex[20, 12]].join('-')
  end
  private_class_method :versioned_id
end
