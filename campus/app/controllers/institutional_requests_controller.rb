# frozen_string_literal: true

# Creates and reviews community/entity requests against their owning institution.
class InstitutionalRequestsController < ApplicationController
  include KeycloakAuthenticated
  include InstitutionalProfileAuthorization
  include InstitutionalRequestProfiles
  include InstitutionalRequestReview
  include InstitutionalRequestWorkflow

  wrap_parameters false

  def index
    requests = InstitutionalRequest.where(requested_by_user_id: current_subject).order(created_at: :desc)
    render_requests(requests, &:api_json)
  end

  def pending
    render_requests(pending_requests, &:api_json)
  end

  def create
    payload = validated_request_payload
    return unless payload

    record = submit_request!(payload)
    render json: record.api_json, status: :created
  rescue ActiveRecord::RecordInvalid
    render_problem(:unprocessable_entity, 'Institutional request is invalid')
  rescue ActiveRecord::RecordNotUnique
    render_problem(:conflict, 'A matching request is already pending')
  end

  def approve
    review do |record|
      created = approve_request!(record)
      render json: approval_response(record, created)
    end
  end

  def reject
    review do |record|
      record.update!(status: InstitutionalRequest::REJECTED, reviewed_at: Time.current,
                     reviewed_by_user_id: current_subject)
      CampusNotifications.request_decided!(record, current_subject)
      render json: record.api_json
    end
  end

  private

  def review(&)
    InstitutionalRequest.transaction { review_record(&) }
  rescue ActiveRecord::RecordInvalid => e
    render_problem(:unprocessable_entity,
                   "Request could not be completed: #{e.record.errors.attribute_names.uniq.sort.join(', ')}")
  rescue ActiveRecord::RecordNotUnique
    render_problem(:conflict, 'A profile for this request already exists')
  rescue ActiveRecord::RecordNotFound => e
    render_problem(:conflict, e.message)
  end

  def review_record
    record = reviewable_request(params[:id])
    return unless record

    yield record
  end

  def render_requests(scope, &)
    pagination = request_page_values
    return unless pagination

    render json: paginated_requests(scope, *pagination, &)
  rescue ArgumentError, TypeError
    render_problem(:bad_request, 'Invalid request list parameters')
  end
end
