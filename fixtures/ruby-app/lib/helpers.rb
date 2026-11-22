module Helpers
  def normalize(name)
    return 'unknown' if name.strip.empty?
    name.strip.downcase.gsub(/\s+/, '_')
  end
end

def display(name, label: 'Record')
  puts "#{label}: #{name}"
end
