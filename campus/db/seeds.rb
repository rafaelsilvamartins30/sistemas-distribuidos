# frozen_string_literal: true

require 'digest'
require 'json'
require 'pathname'
require_relative 'seeders/local_demo_support'
require_relative 'seeders/local_demo_catalog_seeder'
require_relative 'seeders/local_demo_synthetic_seeder'
require_relative 'seeders/local_demo_profiles_seeder'

# Runs the repeatable, additive local demonstration seed in dependency order.
module LocalDemoSeed
  module_function

  def run
    catalog = LocalDemoSeedSupport.catalog
    accounts = LocalDemoSeedSupport.accounts
    LocalDemoCatalogSeeder.new(catalog).call
    LocalDemoSyntheticSeeder.new.call
    LocalDemoProfilesSeeder.new(accounts).call
    Rails.logger.debug seed_summary
  end

  def seed_summary
    [
      'Seed UFLA local concluído: 9 unidades, 32 departamentos, 53 cursos,',
      '112 entidades de referência, 5 comunidades e 8 perfis.'
    ].join(' ')
  end
end

LocalDemoSeed.run
