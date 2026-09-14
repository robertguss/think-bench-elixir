defmodule ThinkBench.Graph.Vocabulary do
  @moduledoc """
  Shared card kinds, link types, and map card size. The TypeScript copies live in
  `assets/js/board/types.ts` and must stay in sync with this module.
  """

  @kinds [:idea, :question, :decision, :source, :objection]
  @hierarchy_types ~w(answers resolves raised-by follows-from depends-on challenges)
  @link_types @hierarchy_types ++ ["cites"]
  @card_width 220
  @card_height 120

  def kinds, do: @kinds
  def hierarchy_types, do: @hierarchy_types
  def link_types, do: @link_types
  def card_width, do: @card_width
  def card_height, do: @card_height
  def card_size, do: {@card_width, @card_height}
end
