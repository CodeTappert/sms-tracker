package main

import (
	"embed"
	"encoding/json"
	"fmt"
	"io/fs"
	"log"
	"net/http"
)

// --- Embedding ---

//go:embed static/*
var staticEmbed embed.FS

//go:embed data/*
var dataEmbed embed.FS

// --- Data Structures ---

// ShineDefinition tracks the state and metadata of a specific shine.
type ShineDefinition struct {
	ID   string `json:"id"` // Unique ID used for tracking logic
	Name string `json:"name"`
}

// Exit represents a loading zone or transition point within the game world.
type Exit struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

// Zone represents a major level or area the player can warp to.
type Zone struct {
	ID              string            `json:"id"`
	Name            string            `json:"name"`
	ShinesAvailable []ShineDefinition `json:"shines_available"`
	BlueCoinIDs     []int             `json:"blue_coin_ids"`
	Exits           []Exit            `json:"exits"`
}

// Unlock represents a game capability, item, or nozzle.
type Unlock struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Icon string `json:"icon"`
}

// PlazaEntrance defines a specific entry point from the hub world (Plaza) to a level.
type PlazaEntrance struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	GroupName string `json:"group_name"` // Used for grouping in the UI (e.g., "Bianco Hills")
	Image     string `json:"image"`
}

// WorldData serves as the root container for all static game configuration loaded from JSON.
type WorldData struct {
	Zones          map[string]Zone `json:"zones"`
	Unlocks        []Unlock        `json:"unlocks"`
	PlazaEntrances []PlazaEntrance `json:"plaza_entrances"`
}

// Global state to hold the data once loaded.
var currentWorld WorldData

// loadGameData parses JSON files and constructs the initial world state.
// This should only be called once during startup.
func loadGameData() {
	// A. Load Zones
	zoneFile, err := dataEmbed.ReadFile("data/zones.json")
	if err != nil {
		log.Fatalf("Error reading embedded zones.json: %v", err)
	}

	// Temporary wrapper to match the JSON structure structure
	var zoneWrapper struct {
		Zones map[string]Zone `json:"zones"`
	}

	if err := json.Unmarshal(zoneFile, &zoneWrapper); err != nil {
		log.Fatalf("Error parsing zones.json: %v", err)
	}

	// The JSON uses the ID as the map key. We inject that key into the struct itself
	// so the frontend receives a fully self-contained object.
	for id, zone := range zoneWrapper.Zones {
		zone.ID = id
		zoneWrapper.Zones[id] = zone
	}

	// B. Load Unlocks
	unlockFile, err := dataEmbed.ReadFile("data/unlocks.json")
	if err != nil {
		log.Fatalf("Error reading embedded unlocks.json: %v", err)
	}

	var unlockWrapper struct {
		Unlocks []Unlock `json:"unlocks"`
	}
	if err := json.Unmarshal(unlockFile, &unlockWrapper); err != nil {
		log.Fatalf("Error parsing unlocks.json: %v", err)
	}

	// C. Define Plaza Entrances programmatically
	var entrances []PlazaEntrance

	// 1. Standalone Entrances (Special stages and secrets)
	singles := []struct{ ID, Name, Image string }{
		{"enter_airstrip", "Airstrip", "airstrip.png"},
		{"enter_corona", "Corona Mountain", "corona.png"},
		{"enter_lilypad", "Lily Pad", "lilypad.png"},
		{"enter_pachinko", "Pachinko", "pachinko.png"},
		{"enter_slide", "Secret Slide", "slide.png"},
		{"enter_turbo", "Turbo Dash", "turbo.png"},
		{"enter_grass", "Red Coin Grass", "grass.png"},
		{"enter_pianta_pipe", "Pianta Village (Pipe)", "pianta_pipe.png"},
	}

	for _, s := range singles {
		entrances = append(entrances, PlazaEntrance{
			ID:        s.ID,
			Name:      s.Name,
			GroupName: "Plaza: Special & Secrets",
			Image:     s.Image,
		})
	}

	// 2. Main Worlds (Generate entries for Episodes 1-8)
	worlds := []struct {
		ID, Name, Image string
	}{
		{"bianco", "Bianco Hills", "bianco_entry.png"},
		{"ricco", "Ricco Harbor", "ricco_entry.png"},
		{"gelato", "Gelato Beach", "gelato_entry.png"},
		{"pinna", "Pinna Park", "pinna_entry.png"},
		{"sirena", "Sirena Beach", "sirena_entry.png"},
		{"noki", "Noki Bay", "noki_entry.png"},
		{"pianta", "Pianta Village", "pianta_entry.png"},
	}

	for _, w := range worlds {
		for ep := 1; ep <= 8; ep++ {
			entrances = append(entrances, PlazaEntrance{
				ID:        fmt.Sprintf("enter_%s_ep%d", w.ID, ep),
				Name:      fmt.Sprintf("Episode %d", ep),
				GroupName: w.Name,
				Image:     w.Image,
			})
		}
	}

	// Assign compiled data to global state
	currentWorld = WorldData{
		Zones:          zoneWrapper.Zones,
		Unlocks:        unlockWrapper.Unlocks,
		PlazaEntrances: entrances,
	}

	fmt.Printf("Data loaded successfully: %d zones, %d entrances configured.\n", len(currentWorld.Zones), len(currentWorld.PlazaEntrances))
}

// --- Server API ---

func main() {
	loadGameData()

	// Prepare the embedded static files for serving over HTTP
	publicFiles, err := fs.Sub(staticEmbed, "static")
	if err != nil {
		log.Fatal(err)
	}

	// Serve the web interface directly from the binary
	http.Handle("/", http.FileServer(http.FS(publicFiles)))

	// API Endpoint to retrieve the current world data as JSON
	http.HandleFunc("/api/data", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if err := json.NewEncoder(w).Encode(currentWorld); err != nil {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		}
	})

	fmt.Println("Server running at http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
