# frozen_string_literal: true

# Records one immutable vote per authenticated user and poll.
class PollVotesController < ApplicationController
  include KeycloakAuthenticated

  wrap_parameters false

  def create
    poll = find_poll
    return unless poll
    return unless poll_open?(poll)

    create_poll_vote(poll)
  rescue ActiveRecord::RecordNotUnique
    render_problem(:conflict, 'A user may vote only once in a poll')
  end

  private

  def find_poll
    poll = Poll.find_by(id: params[:poll_id])
    render_problem(:not_found, 'Poll not found') unless poll
    poll
  end

  def poll_open?(poll)
    return true unless poll.closed?

    render_problem(:conflict, 'Poll is closed')
    false
  end

  def create_poll_vote(poll)
    payload = request.request_parameters
    return render_problem(:bad_request, 'optionId is required') unless valid_vote_payload?(payload)

    option = poll.poll_options.find_by(id: payload['optionId'])
    return render_problem(:bad_request, 'Option does not belong to this poll') unless option

    save_poll_vote(poll, option)
  end

  def valid_vote_payload?(payload)
    payload.is_a?(Hash) && payload.keys == ['optionId'] && payload['optionId'].is_a?(String)
  end

  def save_poll_vote(poll, option)
    vote = poll.poll_votes.new(id: SecureRandom.uuid, user_id: current_subject, poll_option: option)
    return render(json: CampusSocialResponse.poll(poll, voter_id: current_subject), status: :created) if vote.save

    render_problem(:conflict, 'A user may vote only once in a poll')
  end
end
