let map;
let marker;
let userMarker;
let directionsService;
let directionsRenderer;
let searchBox;
let destination;
let userLocation;
let streetViewService;
let streetViewPanorama;
let journeyInterval;
let trafficLayer;
let transitLayer;

function initMap() {
  map = new google.maps.Map(document.getElementById("map"), {
    center: { lat: 37.7749, lng: -122.4194 }, // Default center in case geolocation fails
    zoom: 13,
    streetViewControl: true, // Enable Street View control
  });

  marker = new google.maps.Marker({ map: map });

  // Initialize directions service and renderer
  directionsService = new google.maps.DirectionsService();
  directionsRenderer = new google.maps.DirectionsRenderer({
    map: map,
    suppressMarkers: true,
    polylineOptions: {
      strokeColor: '#ff6b6b', // Customize the route color
      strokeOpacity: 0.7,
      strokeWeight: 5,
    },
  });

  // Initialize the search box for places with autocomplete
  const input = document.getElementById("searchBox");
  searchBox = new google.maps.places.Autocomplete(input);

  // Bias search results to the map's viewport
  map.addListener("bounds_changed", () => {
    searchBox.setBounds(map.getBounds());
  });

  // Handle place selection from search box
  searchBox.addListener("place_changed", () => {
    const place = searchBox.getPlace();
    if (!place.geometry) return;

    // Set the place as the destination
    destination = place.geometry.location;
    map.setCenter(destination);
    marker.setPosition(destination);

    showNotification("Destination set! Ready to start your journey?");
    displayPlaceDetails(place);
  });

  // Initialize Street View service and panorama
  streetViewService = new google.maps.StreetViewService();
  streetViewPanorama = new google.maps.StreetViewPanorama(document.getElementById("street-view"));

  // Initialize traffic and transit layers
  trafficLayer = new google.maps.TrafficLayer();
  transitLayer = new google.maps.TransitLayer();

  // Get the user's live location and set it as the starting point
  getUserLocation();
}

function getUserLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        userLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };

        // Center map on user's location and add a marker
        map.setCenter(userLocation);
        map.setZoom(14);
        if (userMarker) userMarker.setMap(null); // Remove existing marker, if any
        userMarker = new google.maps.Marker({
          position: userLocation,
          map: map,
          title: "You are here",
          icon: {
            url: "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
          },
        });

        showNotification("Location found! Starting from your current position.");
        displayCurrentLocationDetails();
      },
      () => {
        showNotification("Unable to retrieve your location. Please allow location access.");
      }
    );
  } else {
    showNotification("Geolocation is not supported by this browser.");
  }
}

function startJourney() {
  if (!userLocation || !destination) {
    showNotification("Please ensure both current location and destination are set.");
    return;
  }

  // Calculate initial route without detours
  calculateRoute(userLocation, destination);

  // Start tracking user location and updating route with random detours
  journeyInterval = setInterval(() => updateRouteWithRandomDetour(), 30000); // Update every 30 seconds
  trackUserLocation();
}

function pauseJourney() {
  if (journeyInterval) {
    clearInterval(journeyInterval);
    journeyInterval = null;
    showNotification("Journey paused.");
  }
}

function resetJourney() {
  if (journeyInterval) {
    clearInterval(journeyInterval);
    journeyInterval = null;
  }
  directionsRenderer.set('directions', null);
  if (userMarker) userMarker.setMap(null);
  userLocation = null;
  destination = null;
  showNotification("Journey reset.");
}

function toggleTrafficLayer() {
  if (trafficLayer.getMap()) {
    trafficLayer.setMap(null);
    showNotification("Traffic layer hidden.");
  } else {
    trafficLayer.setMap(map);
    showNotification("Traffic layer shown.");
  }
}

function toggleTransitLayer() {
  if (transitLayer.getMap()) {
    transitLayer.setMap(null);
    showNotification("Transit layer hidden.");
  } else {
    transitLayer.setMap(map);
    showNotification("Transit layer shown.");
  }
}

function calculateRoute(origin, destination) {
  const request = {
    origin: origin,
    destination: destination,
    travelMode: google.maps.TravelMode.DRIVING,
    drivingOptions: {
      departureTime: new Date(),
      trafficModel: 'bestguess'
    }
  };

  directionsService.route(request, (result, status) => {
    if (status === google.maps.DirectionsStatus.OK) {
      directionsRenderer.setDirections(result);
      colorRouteBasedOnTraffic(result);
      displayRouteInfo(result, google.maps.TravelMode.DRIVING);
    } else {
      showNotification("Failed to calculate route. Please try again.");
    }
  });
}

function colorRouteBasedOnTraffic(result) {
  const route = result.routes[0].legs[0];
  const trafficColors = {
    UNKNOWN: '#808080', // Gray
    LIGHT: '#00FF00', // Green
    MODERATE: '#FFFF00', // Yellow
    HEAVY: '#FF0000', // Red
    SEVERE: '#800000' // Maroon
  };

  route.steps.forEach((step) => {
    const trafficCondition = step.traffic_speed_entry[0].traffic_speed_condition;
    const polyline = new google.maps.Polyline({
      path: step.path,
      strokeColor: trafficColors[trafficCondition] || trafficColors.UNKNOWN,
      strokeOpacity: 0.7,
      strokeWeight: 5,
      map: map
    });
  });
}

function updateRouteWithRandomDetour() {
  if (!userLocation || !destination) return;

  const detour = generateRandomDetours(userLocation)[0]; // Generate one random detour

  const request = {
    origin: userLocation,
    destination: destination,
    waypoints: [{ location: detour, stopover: true }],
    travelMode: google.maps.TravelMode.DRIVING,
    drivingOptions: {
      departureTime: new Date(),
      trafficModel: 'bestguess'
    }
  };

  directionsService.route(request, (result, status) => {
    if (status === google.maps.DirectionsStatus.OK) {
      directionsRenderer.setDirections(result);
      colorRouteBasedOnTraffic(result);
      showNotification("Detour added to your journey!");
      displayDirectionsInstructions(result);
    } else {
      showNotification("Failed to update route with detour. Please try again.");
    }
  });
}

// Generate random detours near the current location (within 100 meters)
function generateRandomDetours(currentLocation) {
  const detours = [];
  const radius = 0.001; // Approx. 100 meters

  for (let i = 0; i < 3; i++) { // Three random detours
    const angle = Math.random() * 2 * Math.PI;
    const dx = radius * Math.cos(angle);
    const dy = radius * Math.sin(angle);
    const detourLat = currentLocation.lat + dx;
    const detourLng = currentLocation.lng + dy;
    detours.push({ lat: detourLat, lng: detourLng });
  }

  return detours;
}

function trackUserLocation() {
  if (navigator.geolocation) {
    navigator.geolocation.watchPosition(
      (position) => {
        const newLocation = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        userMarker.setPosition(newLocation); // Update user marker position
        map.panTo(newLocation); // Center map on new position
        userLocation = newLocation; // Update user location
        displayCurrentLocationDetails();
      },
      (error) => {
        console.error("Error tracking location:", error);
        showNotification("Location tracking error.");
      }
    );
  }
}

function displayRouteInfo(result, mode) {
  const route = result.routes[0].legs[0];
  const modeName = mode.charAt(0) + mode.slice(1).toLowerCase();
  const infoContainer = document.getElementById("route-info");
  const infoDiv = document.createElement("div");
  infoDiv.innerHTML = `
    <h4>${modeName}</h4>
    <p>Distance: ${route.distance.text}</p>
    <p>Duration: ${route.duration.text}</p>
  `;
  infoContainer.appendChild(infoDiv);
}

function displayDirectionsInstructions(directions) {
  const stepsContainer = document.getElementById("steps");
  stepsContainer.innerHTML = ""; // Clear previous instructions
  const route = directions.routes[0].legs[0];

  route.steps.forEach((step, index) => {
    const stepDiv = document.createElement("div");
    stepDiv.innerHTML = `${index + 1}. ${step.instructions} (${step.distance.text})`;
    stepsContainer.appendChild(stepDiv);
  });
}

function displayPlaceDetails(place) {
  const detailsContainer = document.getElementById("place-details");
  detailsContainer.innerHTML = `
    <h3>${place.name}</h3>
    <p>${place.formatted_address}</p>
    <p>Rating: ${place.rating}</p>
    <p>${place.formatted_phone_number || ""}</p>
    <p>${place.website ? `<a href="${place.website}" target="_blank">Website</a>` : ""}</p>
  `;

  // Show Street View if available
  if (place.geometry && place.geometry.location) {
    streetViewService.getPanorama({ location: place.geometry.location, radius: 50 }, (data, status) => {
      if (status === google.maps.StreetViewStatus.OK) {
        streetViewPanorama.setPano(data.location.pano);
        streetViewPanorama.setPov({ heading: 270, pitch: 0 });
        streetViewPanorama.setVisible(true);
      } else {
        streetViewPanorama.setVisible(false);
      }
    });
  }
}

function displayCurrentLocationDetails() {
  const currentLocationContainer = document.getElementById("current-location-details");
  currentLocationContainer.innerHTML = `
    <h3>Current Location</h3>
    <p>Latitude: ${userLocation.lat}</p>
    <p>Longitude: ${userLocation.lng}</p>
  `;
}

function showNotification(message) {
  const notificationEl = document.getElementById("notification");
  notificationEl.innerText = message;
  notificationEl.style.display = "block";

  setTimeout(() => {
    notificationEl.style.display = "none";
  }, 3000);
}