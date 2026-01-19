package main

import (
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"os"
)

// --- 1. DATENMODELLE ---

// NEU: Definition für einen einzelnen Shine
type ShineDefinition struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Exit struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}

type Zone struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	// WICHTIG: Hier Array statt int!
	ShinesAvailable []ShineDefinition `json:"shines_available"`
	BlueCoinIDs     []int             `json:"blue_coin_ids"`
	Exits           []Exit            `json:"exits"`
}

type Unlock struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Icon string `json:"icon"`
}

type PlazaEntrance struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	GroupName string `json:"group_name"`
	Image     string `json:"image"`
}

type WorldData struct {
	Zones          map[string]Zone `json:"zones"`
	Unlocks        []Unlock        `json:"unlocks"`
	PlazaEntrances []PlazaEntrance `json:"plaza_entrances"`
}

var currentWorld WorldData

// --- 2. DATEN LADEN ---

func loadGameData() {
	// A. Zonen laden
	zoneFile, err := ioutil.ReadFile("data/zones.json")
	if err != nil {
		log.Fatalf("Fehler beim Lesen von zones.json: %v", err)
	}

	var zoneWrapper struct {
		Zones map[string]Zone `json:"zones"`
	}

	if err := json.Unmarshal(zoneFile, &zoneWrapper); err != nil {
		log.Fatalf("Fehler beim Parsen von zones.json: %v", err)
	}

	// IDs injecten
	for id, zone := range zoneWrapper.Zones {
		zone.ID = id
		zoneWrapper.Zones[id] = zone
	}

	// B. Unlocks laden
	unlockFile, err := ioutil.ReadFile("data/unlocks.json")
	if err != nil {
		log.Fatalf("Fehler beim Lesen von unlocks.json: %v", err)
	}

	var unlockWrapper struct {
		Unlocks []Unlock `json:"unlocks"`
	}
	if err := json.Unmarshal(unlockFile, &unlockWrapper); err != nil {
		log.Fatalf("Fehler beim Parsen von unlocks.json: %v", err)
	}

	// C. Plaza Eingänge definieren
	var entrances []PlazaEntrance

	// 1. Einzel-Eingänge (Mit Bildern)
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

	// 2. Die Hauptwelten (Episoden 1-8)
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

	currentWorld = WorldData{
		Zones:          zoneWrapper.Zones,
		Unlocks:        unlockWrapper.Unlocks,
		PlazaEntrances: entrances,
	}

	fmt.Printf("Daten geladen: %d Zonen, %d Eingänge.\n", len(currentWorld.Zones), len(currentWorld.PlazaEntrances))
}

// --- 3. SERVER API ---

func main() {
	loadGameData()

	if _, err := os.Stat("./static"); os.IsNotExist(err) {
		log.Fatal("Ordner './static' fehlt!")
	}
	fs := http.FileServer(http.Dir("./static"))
	http.Handle("/", fs)

	http.HandleFunc("/api/data", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(currentWorld)
	})

	fmt.Println("Server läuft auf http://localhost:8080")
	log.Fatal(http.ListenAndServe(":8080", nil))
}
