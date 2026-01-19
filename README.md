# SMS Randomizer Tracker

A tracker for the Super Mario Sunshine Randomizer that allows users to map randomized zones to Plaza entrances and track Shine and Blue Coin collections.

## Features

* **Zone Mapping**: Map randomized zones to Plaza entrances for easy navigation.
* **Shine Tracking**: Keep track of collected Shines and blue coins in each zone, plaza entrance, and overall.
* **User-Friendly Interface**: Simple and intuitive interface for easy tracking.
* **Data Persistence**: Save and load your tracking data with JSON files.

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