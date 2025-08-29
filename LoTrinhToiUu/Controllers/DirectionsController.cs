// Controllers/DirectionsController.cs
using Microsoft.AspNetCore.Mvc;
using System.Text;

namespace LoTrinhToiUu.Controllers;

[ApiController]
[Route("api")]
public class DirectionsController : ControllerBase
{
    private readonly HttpClient _http;
    private readonly IConfiguration _cfg;
    public DirectionsController(IHttpClientFactory f, IConfiguration cfg)
    { _http = f.CreateClient(); _cfg = cfg; }

    // POST /api/coach-route
    // Body: { "coords":[[lng,lat],...], "vehicle":{ "weightTons":15,"height":3.5,"width":2.5,"length":12 } }
    [HttpPost("coach-route")]
    public async Task<IActionResult> CoachRoute([FromBody] CoachRouteReq req)
    {
        if (req?.Coords == null || req.Coords.Count < 2)
            return BadRequest("Cần ít nhất 2 điểm [lng,lat].");

        var baseUrl = _cfg["ORS:BaseUrl"] ?? "https://api.openrouteservice.org/v2/directions/driving-hgv";
        var apiKey = _cfg["ORS:ApiKey"] ?? "";
        var url = $"{baseUrl}?api_key={Uri.EscapeDataString(apiKey)}";

        var payload = new
        {
            coordinates = req.Coords,         // [[lng,lat],...]
            instructions = true,
            preference = "recommended",
            avoid_features = new[] { "fords", "steps", "ferry" },
            profile_params = new
            {
                weight = req.Vehicle?.WeightTons ?? 15.0,
                height = req.Vehicle?.Height ?? 3.5,
                width = req.Vehicle?.Width ?? 2.5,
                length = req.Vehicle?.Length ?? 12.0
            },
            geometry = true,
            geometry_format = "geojson"
        };

        var json = System.Text.Json.JsonSerializer.Serialize(payload);
        var res = await _http.PostAsync(url, new StringContent(json, Encoding.UTF8, "application/json"));
        var body = await res.Content.ReadAsStringAsync();
        if (!res.IsSuccessStatusCode) return StatusCode((int)res.StatusCode, body);
        return Content(body, "application/json");
    }

    public class CoachRouteReq
    {
        public List<double[]> Coords { get; set; } = new(); // [[lng,lat],...]
        public VehicleSpec? Vehicle { get; set; }
    }
    public class VehicleSpec
    {
        public double WeightTons { get; set; } = 15.0;
        public double Height { get; set; } = 3.5;
        public double Width { get; set; } = 2.5;
        public double Length { get; set; } = 12.0;
    }
}
