# SMS Randomizer Tracker

A tracker for the Super Mario Sunshine Randomizer that allows users to map randomized zones to Plaza entrances and track Shine and Blue Coin collections.


![GitHub release (latest by date)](https://img.shields.io/github/v/release/CodeTappert/sms-tracker?style=flat-square)
![GitHub go.mod Go version](https://img.shields.io/github/go-mod/go-version/CodeTappert/sms-tracker?style=flat-square)
![GitHub license](https://img.shields.io/github/license/CodeTappert/sms-tracker?style=flat-square)
![GitHub issues](https://img.shields.io/github/issues/CodeTappert/sms-tracker?style=flat-square)

## License

This code in this project is licensed under the MIT License. Assets in /static/images is not licensed at all and is owned by Nintendo. For more information, see [LICENSE](LICENSE).

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any improvements or bug fixes.

## Features

* **Zone Mapping**: Map randomized zones to Plaza entrances for easy navigation.
* **Shine Tracking**: Keep track of collected Shines and blue coins in each zone, plaza entrance, and overall.
* **User-Friendly Interface**: Simple and intuitive interface for easy tracking.
* **Data Persistence**: Save and load your tracking data with JSON files.

## Configuration
By default, the tracker runs on port `8080`. To use a custom port, create a `config.json` file in the same directory as the executable:

```json
{
  "port": 9000
}
```

## Download and Execution

### Precompiled Binaries

* You can download precompiled binaries from the releases section

### Running the Application

* After downloading the binary, simply execute it: 
  * On Linux:
    ```bash
    ./sms-tracker
    ```
  * On Windows:
    ```bash
    sms-tracker.exe
    ```

* Then open your web browser and navigate to `http://localhost:8080` (or your specified port) to access the tracker.
* You can also Ctrl+Click the link in the console to open it directly.

## Compilation

### Prerequisites

* **Go**: You need the Go programming language installed to compile or run the backend.

### running from Source

You can run the application directly without compiling a binary:

```bash
go run main.go
```

### Compiling Linux
To compile the application into a binary, use the following command:

```bash
go build -o sms-tracker main.go
```

### Compiling Windows
To compile the application for Windows, use the following command:

```bash
go build -o sms-tracker.exe main.go
```



## ASSET DISCLAIMER:

This project contains assets (images, icons, names) from "Super Mario Sunshine"
which are the intellectual property of Nintendo. These assets are used for
fan/tracking purposes only.

The MIT License applies ONLY to the source code (Go, HTML, CSS, JS)
created for this project. It does NOT grant any rights to the game assets
contained within the "static/images" folder or any other game-related media.
All rights to those assets remain with Nintendo.
