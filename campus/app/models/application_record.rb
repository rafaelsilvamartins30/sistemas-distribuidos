# frozen_string_literal: true

# Base class for Campus-owned Active Record models.
class ApplicationRecord < ActiveRecord::Base
  primary_abstract_class
end
