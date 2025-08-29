using Microsoft.AspNetCore.Mvc;

namespace CityTourApp.Controllers
{
    public class MapController : Controller
    {
        public IActionResult Index() => View();
    }
}
