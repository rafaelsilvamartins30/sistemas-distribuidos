FROM ruby:3.4.12-slim

RUN apt-get update \
    && apt-get install --no-install-recommends -y build-essential=12.12 libpq-dev=17.12-0+deb13u1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY Gemfile* .ruby-version ./
RUN bundle install --jobs 4 --retry 3

COPY . .

EXPOSE 3000
CMD ["bin/rails", "server", "-b", "0.0.0.0"]
