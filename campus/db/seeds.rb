# frozen_string_literal: true

require 'digest'
require 'json'
require 'pathname'
require_relative 'seeders/local_demo_support'
require_relative 'seeders/local_demo_structure_seeder'
require_relative 'seeders/local_demo_profiles_seeder'

# Runs the idempotent UNIR Campus seed in either 'clean' or 'demo' mode.
module LocalDemoSeed
  module_function

  def run
    manifest = LocalDemoSeedSupport.manifest
    mode = LocalDemoSeedSupport.seed_mode(manifest)
    accounts = LocalDemoSeedSupport.accounts(manifest)
    structure = LocalDemoStructureSeeder.new(accounts.fetch('admin').fetch('sub'))
    structure.seed_base_university
    seed_demo(structure, accounts) if mode == 'demo'
    Rails.logger.info summary(mode, accounts.size)
  end

  def seed_demo(structure, accounts)
    structure.seed_demo_structure
    LocalDemoProfilesSeeder.new(accounts).call
  end

  def summary(mode, account_count)
    return 'Seed Campus (modo clean) concluído: Universidade + 1 admin (admin@gmail.com).' if mode == 'clean'

    'Seed Campus (modo demo) concluído: Universidade, 1 unidade, 2 departamentos, 2 cursos, ' \
      "3 comunidades, 2 entidades e #{account_count} perfis."
  end
end

LocalDemoSeed.run
