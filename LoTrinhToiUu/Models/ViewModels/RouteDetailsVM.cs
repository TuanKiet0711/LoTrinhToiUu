using CityTourApp.Models;

namespace CityTourApp.Models.ViewModels
{
    public class RouteDetailsVM
    {
        public List<Attraction> Attractions { get; set; } = new();
        public double TotalDistance { get; set; }
        public double EstimatedTime { get; set; }
    }
}
