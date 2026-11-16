# frozen_string_literal: true

# Lists and reads community profiles; social posts are handled by a separate contract.
class CommunitiesController < ApplicationController
  before_action :authenticate_keycloak!

  def index
    page = integer_parameter(:page, 0)
    size = integer_parameter(:size, 20)
    sort = sort_parameter
    unless page && page >= 0 && size&.positive? && sort
      return render_problem(:bad_request, 'Invalid community list parameters')
    end

    render json: community_page(page, size, sort)
  end

  def show
    community = Community.find_by(id: params[:id])
    return render_problem(:not_found, 'Community not found') unless community

    render json: community_response(community)
  end

  private

  def authenticate_keycloak!
    match = request.authorization.to_s.match(/\ABearer\s+(\S+)\z/i)
    return render_problem(:unauthorized, 'Bearer token is required') unless match

    claims = KeycloakJwt.decode(match[1])
    return if claims['sub'].present?

    render_problem(:unauthorized, 'Bearer token subject is required')
  rescue JWT::DecodeError, JWT::JWKError
    render_problem(:unauthorized, 'Invalid bearer token')
  rescue KeycloakJwt::Unavailable
    render_problem(:service_unavailable, 'Keycloak is unavailable')
  end

  def integer_parameter(name, default)
    Integer(params.fetch(name, default.to_s), 10)
  rescue ArgumentError, TypeError
    nil
  end

  def sort_parameter
    sort = params.fetch(:sort, 'name')
    direction = sort.start_with?('-') ? :desc : :asc
    field = sort.delete_prefix('-')
    return { field => direction } if %w[name category].include?(field)

    nil
  end

  def community_response(community)
    {
      id: community.id, name: community.name, description: community.description,
      generalInfoMarkdown: community.general_info_markdown, category: community.category,
      logoUrl: community.logo_url, bannerUrl: community.banner_url, links: community.links,
      managerUserIds: community.manager_user_ids
    }
  end

  def community_page(page, size, sort)
    communities = Community.order(sort)
    total_elements = communities.count
    items = communities.offset(page * size).limit(size).map { |community| community_response(community) }
    { items: items, page: page, size: size, totalElements: total_elements,
      totalPages: (total_elements.to_f / size).ceil }
  end
end
