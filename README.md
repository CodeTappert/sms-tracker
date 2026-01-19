# SMS Randomizer Tracker

A tracker for the Super Mario Sunshine Randomizer that allows users to map randomized zones to Plaza entrances and track Shine and Blue Coin collections.

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