# frozen_string_literal: true

# Lists and edits community institutional profiles.
class CommunitiesController < ApplicationController
  include KeycloakAuthenticated
  include InstitutionalProfileAuthorization
  include InstitutionalProfileSerialization

  wrap_parameters false

  def index
    page, size, sort = pagination_parameters
    return render_problem(:bad_request, 'Invalid community list parameters') unless page

    communities = Community.order(sort)
    total = communities.count
    render json: { items: communities.offset(page * size).limit(size).map { |community| community_response(community) },
                   page: page, size: size, totalElements: total, totalPages: (total.to_f / size).ceil }
  end

  def show
    community = Community.find_by(id: params[:id])
    return render_problem(:not_found, 'Community not found') unless community

    render json: community_response(community)
  end

  def update
    community = Community.find_by(id: params[:id])
    return render_problem(:not_found, 'Community not found') unless community

    update_community_profile(community)
  end

  def destroy
    return unless require_university_admin

    community = Community.find_by(id: params[:id])
    return render_problem(:not_found, 'Community not found') unless community

    community.destroy!
    head :no_content
  end

  private

  def update_community_profile(community)
    payload = profile_payload(%w[name description generalInfoMarkdown logoUrl bannerUrl links administratorUserIds
                                 category departmentId])
    return unless payload
    return unless authorize_profile_update?(community, payload)
    return unless valid_department_change?(community, payload)

    assign_community_fields(community, payload)
    save_community(community)
  end

  def valid_department_change?(community, payload)
    return true unless payload.key?('departmentId') && payload['departmentId'] != community.department_id

    unless global_platform_admin?
      render_problem(:forbidden, 'Only the platform administrator can move a community between departments')
      return false
    end
    return true if payload['departmentId'].nil? || Department.exists?(id: payload['departmentId'])

    render_problem(:unprocessable_entity, 'Target department not found')
    false
  end

  def assign_community_fields(community, payload)
    assign_profile_fields(community, payload.except('category', 'departmentId'))
    community.category = payload['category'] if payload.key?('category')
    community.department_id = payload['departmentId'] if payload.key?('departmentId')
  end

  def save_community(community)
    return render(json: community_response(community)) if community.save

    render_problem(:unprocessable_entity, "Invalid fields: #{community.errors.attribute_names.uniq.sort.join(', ')}")
  end

  def pagination_parameters
    page = Integer(params.fetch(:page, '0'), 10)
    size = Integer(params.fetch(:size, '20'), 10)
    sort = params.fetch(:sort, 'name')
    direction = sort.start_with?('-') ? :desc : :asc
    field = sort.delete_prefix('-')
    return unless page >= 0 && size.between?(1, 100) && %w[name category].include?(field)

    [page, size, { field => direction }]
  rescue ArgumentError, TypeError
    nil
  end

  def community_response(community)
    institutional_profile_fields(community).merge(category: community.category, departmentId: community.department_id)
  end
end
