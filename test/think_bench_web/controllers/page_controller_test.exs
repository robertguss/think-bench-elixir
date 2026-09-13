defmodule ThinkBenchWeb.PageControllerTest do
  use ThinkBenchWeb.ConnCase

  test "GET / serves the React mount point and bundle", %{conn: conn} do
    html = conn |> get(~p"/") |> html_response(200)

    assert html =~ ~s(<div id="root"></div>)
    assert html =~ "/assets/js/app.js"
  end
end
