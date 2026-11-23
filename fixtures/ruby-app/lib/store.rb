require 'json'
require_relative 'helpers'

# Stores named records.
class Store
  ENV_KEY = 'APP_STORE_KEY'

  def initialize
    @names = []
  end

  # Add one or more names.
  def add(prefix = '', *names, unique: false, **options)
    names.each { |name| @names.push(prefix + name) }
    @names.length
  end

  def self.build
    Store.new
  end

  private

  def normalize(name)
    name.strip.downcase
  end

  public

  def clean_name(value)
    value.strip.downcase
  end

  private :clean_name
end
