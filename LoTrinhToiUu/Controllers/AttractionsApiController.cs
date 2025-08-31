using LoTrinhToiUu.Data;
using Microsoft.AspNetCore.Mvc;
using System.Linq;

namespace LoTrinhToiUu.Controllers
{
    [ApiController] // Đánh dấu đây là API Controller
    [Route("api/attractions")]   // Endpoint: /api/attractionsapi
    public class AttractionsApiController : ControllerBase
    {
        private readonly CityTourContext _db;

        public AttractionsApiController(CityTourContext db)
        {
            _db = db;
        }

        // GET: /api/attractionsapi
        [HttpGet]
        public IActionResult GetAll()
        {
            var data = _db.Attractions.ToList();
            return Ok(data); // trả về JSON
        }

        // GET: /api/attractionsapi/{id}
        [HttpGet("{id}")]
        public IActionResult GetById(int id)
        {
            var item = _db.Attractions.FirstOrDefault(a => a.Id == id);
            if (item == null)
                return NotFound();
            return Ok(item);
        }
    }
}
