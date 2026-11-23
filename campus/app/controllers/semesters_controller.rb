# frozen_string_literal: true

# Lists university semesters; only university administrators may create or edit them.
class SemestersController < ApplicationController
  include KeycloakAuthenticated
  include InstitutionalProfileAuthorization

  SEMESTER_FIELDS = %w[name startOn endOn].freeze

  wrap_parameters false

  def index
    page, size = pagination_parameters
    return render_problem(:bad_request, 'Invalid semester list parameters') unless page

    semesters = Semester.where(university_id: University::SINGLETON_ID).order(starts_on: :desc, name: :desc)
    total = semesters.count
    items = semesters.offset(page * size).limit(size).map { |semester| semester_response(semester) }
    render json: { items: items, page: page, size: size, totalElements: total, totalPages: (total.to_f / size).ceil }
  end

  def show
    semester = Semester.find_by(id: params[:id], university_id: University::SINGLETON_ID)
    return render_problem(:not_found, 'Semester not found') unless semester

    render json: semester_response(semester)
  end

  def create
    university = university_for_admin
    return unless university && (payload = semester_payload)

    semester = university.semesters.new(id: SecureRandom.uuid, name: payload['name'],
                                        starts_on: payload['startOn'], ends_on: payload['endOn'])
    save_semester(semester, status: :created)
  end

  def update
    university = university_for_admin
    return unless university && (semester = find_semester(university)) && (payload = semester_payload)

    semester.assign_attributes(name: payload.fetch('name', semester.name),
                               starts_on: payload.fetch('startOn', semester.starts_on),
                               ends_on: payload.fetch('endOn', semester.ends_on))
    save_semester(semester)
  end

  def destroy
    return unless university_for_admin

    semester = Semester.find_by(id: params[:id])
    return render_problem(:not_found, 'Semester not found') unless semester

    semester.destroy!
    head :no_content
  end

  private

  def pagination_parameters
    page = Integer(params.fetch(:page, '0'), 10)
    size = Integer(params.fetch(:size, '100'), 10)
    return unless page >= 0 && size.between?(1, 100)

    [page, size]
  rescue ArgumentError, TypeError
    nil
  end

  def semester_payload
    payload = request.request_parameters
    unless payload.is_a?(Hash)
      render_problem(:bad_request, 'Invalid request body')
      return nil
    end

    invalid = invalid_semester_payload_fields(payload)
    return payload if invalid.empty?

    render_problem(:bad_request, "Invalid fields: #{invalid.uniq.sort.join(', ')}")
    nil
  end

  def invalid_semester_payload_fields(payload)
    invalid = payload.keys - SEMESTER_FIELDS
    invalid.concat(payload.filter_map { |key, value| key if SEMESTER_FIELDS.include?(key) && !value.is_a?(String) })
  end

  def find_semester(university)
    semester = university.semesters.find_by(id: params[:id])
    return semester if semester

    render_problem(:not_found, 'Semester not found')
    nil
  end

  def save_semester(semester, status: :ok)
    return render(json: semester_response(semester), status: status) if semester.save

    render_problem(:unprocessable_entity, "Invalid fields: #{semester.errors.attribute_names.uniq.sort.join(', ')}")
  end

  def university_for_admin
    university = University.current
    unless university
      render_problem(:not_found, 'University not found')
      return nil
    end
    return university if university.administrator_user_ids.include?(current_subject)

    render_problem(:forbidden, 'University administrator access is required')
    nil
  end

  def semester_response(semester)
    { id: semester.id, name: semester.name, startOn: semester.starts_on, endOn: semester.ends_on }
  end
end
