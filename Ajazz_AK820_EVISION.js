import DeviceDiscovery from "@SignalRGB/DeviceDiscovery";
export function Name() { return "Ajazz AK820 (EVision)"; }
export function VendorId() { return 0x320F; }
export function ProductId() { return Object.keys(EVISIONdeviceLibrary.PIDLibrary); }
export function Publisher() { return "WhirlwindFx & Nuonuo"; }
export function Documentation(){ return "troubleshooting/evision"; }
export function Size() { return [1, 1]; }
export function DeviceType(){return "keyboard";}
export function Validate(endpoint) {
	return endpoint.interface === 1 &&
		endpoint.usage === 0x0092 &&
		endpoint.usage_page === 0xFF1C &&
		endpoint.collection === 0x0004;
}
export function ImageUrl() { return "https://assets.signalrgb.com/devices/default/misc/usb-drive-render.png"; }
/* global
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
lowFPS:readonly
monochrome:readonly
forcedModel:readonly
*/
export function ControllableParameters(){
	return [
		{property:"shutdownColor", group:"lighting", label:"Shutdown Color", description: "This color is applied to the device when the System, or SignalRGB is shutting down", min:"0", max:"360", type:"color", default:"#000000"},
		{property:"LightingMode", group:"lighting", label:"Lighting Mode", description: "Determines where the device's RGB comes from. Canvas will pull from the active Effect, while Forced will override it to a specific color", type:"combobox", values:["Canvas", "Forced"], default:"Canvas"},
		{property:"forcedColor", group:"lighting", label:"Forced Color", description: "The color used when 'Forced' Lighting Mode is enabled", min:"0", max:"360", type:"color", default:"#009bde"},
		{property:"lowFPS", group: "lighting", label:"Low frame-rate mode", description: "Adds a safe delay between AK820 RGB packets", type:"boolean", default:true},
		{property:"monochrome", group:"lighting", label:"Monochrome mode", description: "This option allows control of monochrome models", type:"boolean", default:false},
		{property:"forcedModel", group:"lighting", label:"Forced Model", description: "Forces a specific model when automatic detection fails", type:"combobox", values: Object.keys(EVISIONdeviceLibrary.LEDLibrary), default: "None"}
	];
}

export function Initialize() {
	EVISION.Initialize();
}

export function Render() {
	EVISION.sendColors();
}

export function Shutdown(SystemSuspending) {
	const color = SystemSuspending ? "#000000" : shutdownColor;
	EVISION.sendColors(color); // Go Dark on System Sleep/Shutdown
}

export function onforcedModelChanged() {
	EVISION.updateModel(forcedModel);
}

export class EVISION_Device_Protocol {
	constructor() {
		this.Config = {
			DeviceProductID: 0x0000,
			DeviceName: "EVISION Device",
			DeviceEndpoint: [{"interface": 1, "usage": 0x0092, "usage_page": 0xFF1C, "collection": 0x0004 }],
			LedNames: [],
			LedPositions: [],
			Leds: [],
		};
	}

	getDeviceProperties(id) {

		const deviceConfig = EVISIONdeviceLibrary.LEDLibrary[id];

		if(!deviceConfig) {
			console.log(`Unknown Device ID: [${id}]. Reach out to support@signalrgb.com, or visit our Discord to get it added.`);
		}

		return deviceConfig;
	};

	getModelID() { return this.Config.ModelID; }
	setModelID(modelid) { this.Config.ModelID = modelid; }

	getDeviceProductId() { return this.Config.DeviceProductID; }
	setDeviceProductId(productID) { this.Config.DeviceProductID = productID; }

	getDeviceName() { return this.Config.DeviceName; }
	setDeviceName(deviceName) { this.Config.DeviceName = deviceName; }

	getDeviceEndpoint() { return this.Config.DeviceEndpoint; }
	setDeviceEndpoint(deviceEndpoint) { this.Config.DeviceEndpoint = deviceEndpoint; }

	getLedLayout() { return this.Config.layout; }
	setLedLayout(layout) { this.Config.layout = layout; }

	getLedNames() { return this.Config.LedNames; }
	setLedNames(ledNames) { this.Config.LedNames = ledNames; }

	getLedPositions() { return this.Config.LedPositions; }
	setLedPositions(ledPositions) { this.Config.LedPositions = ledPositions; }

	getLeds() { return this.Config.Leds; }
	setLeds(leds) { this.Config.Leds = leds; }

	Initialize() {
		//Initializing vars
		this.setDeviceProductId(device.productId());

		const deviceHID = device.getDeviceInfo();

		// Fetch model
		const modelID	= forcedModel === "None" ? deviceHID.product : forcedModel;

		this.updateModel(modelID);
	}

	sendColors(overrideColor) {

		if(!this.getModelID() || this.getLedLayout() === "None" || this.getLedLayout() === "QMK") {
			return;
		}

		const deviceLedPositions	= this.getLedPositions();
		const deviceLeds			= this.getLeds();
		// The AK820 firmware uses a fixed 384-byte RGB controller buffer.
		// Initialize the whole frame so unused matrix positions remain zero.
		const RGBData				= new Array(384).fill(0);

		for (let iIdx = 0; iIdx < deviceLeds.length; iIdx++) {
			const iPxX = deviceLedPositions[iIdx][0];
			const iPxY = deviceLedPositions[iIdx][1];
			let color;

			if(overrideColor){
				color = hexToRgb(overrideColor);
			}else if (LightingMode === "Forced") {
				color = hexToRgb(forcedColor);
			}else{
				color = device.color(iPxX, iPxY);
			}

			const channelBase = deviceLeds[iIdx] * 3;

			if (monochrome) {
				const monochromeValue = Math.max(color[0], color[1], color[2]);
				RGBData[channelBase] = monochromeValue;
				RGBData[channelBase + 1] = monochromeValue;
				RGBData[channelBase + 2] = monochromeValue;
			} else {
				RGBData[channelBase] = color[0];
				RGBData[channelBase + 1] = color[1];
				RGBData[channelBase + 2] = color[2];
			}
		}

		this.writeRGBPackage(RGBData);
	}

	writeRGBPackage(RGBData){
		const frameLength = 384;
		const pauseDuration = lowFPS ? 5 : 2;
		const frame = RGBData.slice(0, frameLength);

		while (frame.length < frameLength) {
			frame.push(0);
		}

		let byteOffset = 0;

		while (byteOffset < frameLength) {
			const bytesToSend = Math.min(56, frameLength - byteOffset);
			const data = frame.splice(0, bytesToSend);
			const bytesSent = this.getHighLow(byteOffset);
			const checksum = this.calculateChecksum(data, bytesSent, bytesToSend);

			// EVision reserves report byte 7. RGB payload begins at byte 8.
			const header = [0x04, checksum.low, checksum.high, 0x12, bytesToSend, bytesSent.low, bytesSent.high, 0x00];
			const packet = header.concat(data);

			while (packet.length < 64) {
				packet.push(0x00);
			}

			device.write(packet, 64);
			device.pause(pauseDuration);
			byteOffset += bytesToSend;
		}

	}

	setSoftwareMode() {
		device.write([0x04, 0x8c, 0x00, 0x0b, 0x30, 0x50, 0x01], 64);
	}

	calculateChecksum(packet, bytesSent, bytesToSend) {
		const packetSum = packet.reduce((sum, num) => sum + num, 0);
		const headerSum = 0x12 + bytesToSend + bytesSent.low + bytesSent.high;

		return this.getHighLow(packetSum + headerSum);
	}

	getHighLow(index) {
		const high = (index >>> 8) & 0xFF;
		const low = index & 0xFF;

		return { high, low };
	}

	updateModel(modelID) {
		const DeviceProperties = this.getDeviceProperties(modelID);

		if(DeviceProperties){
			this.setModelID(modelID);
			this.setDeviceName(DeviceProperties.name);

			device.log(`Device model found: ` + this.getDeviceName());
			device.setName(this.getDeviceName());
			device.setImageFromUrl(DeviceProperties.image);

			if(DeviceProperties.layout === "None"){
				this.setLedLayout(DeviceProperties.layout);
				device.notify("Unsupported mode", `This connection mode isn't supported due to firmware limitations.`, 2);
				console.log("This connection mode isn't supported due to firmware limitations.");
			} else if(DeviceProperties.layout === "QMK"){
				this.setLedLayout(DeviceProperties.layout);
				device.notify("Unsupported firmware", `This device needs to be flashed with a QMK firmware to be supportable.`, 2);
				console.log("This device needs to be flashed with a QMK firmware to be supportable.");
			}else{
				this.setLedLayout(undefined);
				this.setLedNames(DeviceProperties.vLedNames);
				this.setLedPositions(DeviceProperties.vLedPositions);
				this.setLeds(DeviceProperties.vLeds);
				this.detectDeviceEndpoint(DeviceProperties);

				device.setSize(DeviceProperties.size);
				device.setControllableLeds(this.getLedNames(), this.getLedPositions());
			}
		}else{
			device.notify("Unknown device", `Reach out to support@signalrgb.com, or visit our Discord to get it added.`, 1);
			console.log("Model not found in library!");
			console.log("Unknown protocol for "+ modelID);

			DeviceDiscovery.foundVirtualDevice({
				type: "keyboard",
				name: modelID,
				supported: false,
				vendorId: 0x320F
			});
		}
	}

	detectDeviceEndpoint(deviceLibrary) {

		console.log("Searching for endpoints...");

		const deviceEndpoints = device.getHidEndpoints();

		for (let endpoints = 0; endpoints < deviceLibrary.endpoint.length; endpoints++) {
			const endpoint = deviceLibrary.endpoint[endpoints];

			for (let endpointList = 0; endpointList < deviceEndpoints.length; endpointList++) {
				const currentEndpoint = deviceEndpoints[endpointList];

				if (
					endpoint.interface	=== currentEndpoint.interface	&&
					endpoint.usage		=== currentEndpoint.usage		&&
					endpoint.usage_page	=== currentEndpoint.usage_page	&&
					endpoint.collection	=== currentEndpoint.collection	) {

					this.setDeviceEndpoint(currentEndpoint);
					device.set_endpoint(
						currentEndpoint.interface,
						currentEndpoint.usage,
						currentEndpoint.usage_page,
						currentEndpoint.collection,
					);

					console.log("Endpoint " + JSON.stringify(currentEndpoint) + " found!");

					return;
				}
			}
		}

		console.log(`Endpoints not found in the device! - ${JSON.stringify(deviceLibrary.endpoint)}`);
	}
}

export class deviceLibrary {
	constructor(){
		this.PIDLibrary	=	{
			// The wired Ajazz AK820 reports as Evision VID 0x320F / PID 0x505B.
			// Keep this override PID-specific so it does not replace the built-in
			// EVision handler for unrelated keyboards.
			0x505B: "AK820",
		};

		this.LEDLibrary	=	{

			"VGN N75": {
				name: "VGN N75",
				image: "https://assets.signalrgb.com/devices/brands/vgn/keyboards/n75.png",
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Del",
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace", "Home",
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\", "PgUp",
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "Enter", "PgDn",
					"Left Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Right Shift", "Up Arrow", "End",
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Right Ctrl", "Left Arrow", "Down Arrow", "Right Arrow",
				],
				vLeds:  [
					0,  2,  3,  4,  5,  6,  7,  8, 9, 10, 11, 12, 13, 16,
					21,	22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 38,
					42,  43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 59,
					63,  64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 	 76, 80,
					84,  86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 	97,  99, 101,
					105, 106, 107,		108,		109, 110, 111,  120, 121, 122,
				],
				vLedPositions: [
					[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [13, 0],
					[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1],
					[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2],
					[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3],		   [13, 3], [14, 3],
					[0, 4],         [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [14, 4],
					[0, 5], [1, 5], [2, 5],							[6, 5],					[9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [14, 5],
				],
				size: [15, 6],
				endpoint: [{ "interface": 1, "usage": 0x0092, "usage_page": 0xFF1C, "collection": 0x0004 }]
			},
			"VGN N75 Pro": {
				name: "VGN N75 Pro",
				image: "https://assets.signalrgb.com/devices/brands/vgn/keyboards/n75.png",
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Del",
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace", "Home",
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\", "PgUp",
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "Enter", "PgDn",
					"Left Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Right Shift", "Up Arrow", "End",
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Right Ctrl", "Left Arrow", "Down Arrow", "Right Arrow",
				],
				vLeds:  [
					0,  1,  2,  3,  4,  5,  6,  7,  8,  9, 10, 11, 12, 13,
					15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29,
					30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44,
					45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56,     58, 59,
					60,     62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74,
					75, 76, 77,             81,         84, 85, 86, 87, 88, 89
				],
				vLedPositions: [
					[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [13, 0],
					[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1],
					[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2],
					[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3],		   [13, 3], [14, 3],
					[0, 4],         [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [14, 4],
					[0, 5], [1, 5], [2, 5],							[6, 5],					[9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [14, 5],
				],
				size: [15, 6],
				endpoint: [{ "interface": 1, "usage": 0x0092, "usage_page": 0xFF1C, "collection": 0x0004 }]
			},
			"ZUOYA GMK61": {
				name: "ZUOYA GMK61",
				image: "https://assets.signalrgb.com/devices/brands/zuoya/keyboards/gmk61.png",
				vLedNames: [
					"Esc", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace",
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\",
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'",  "ISO_#",  "Enter",
					"Left Shift", "ISO_<", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/",     "Right Shift",
					"Left Ctrl", "Left Win", "Left Alt",        "Space",      "Right Alt", "Menu", "Right Ctrl", "Fn"
				],
				vLeds:  [
					22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34,  36,
					44,  45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 58,
					66,   68, 69, 70, 71, 72, 73, 74, 75, 76, 77, 78, 79, 80,
					88, 89, 90, 91, 92, 93, 94, 95, 96, 97, 98, 99,      102,
					110, 111, 112,         116,          120, 121, 122, 123
				],
				vLedPositions: [
					[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0],   [13, 0],
					[0, 1],  [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1],  [13, 1],
					[0, 2],   [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2],
					[0, 3],  [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3],             [13, 3],
					[0, 4], [1, 4], [2, 4],                         [6, 4],                            [10, 4], [11, 4], [12, 4], [13, 4]
				],
				size: [14, 5],
				endpoint: [{ "interface": 1, "usage": 0x0092, "usage_page": 0xFF1C, "collection": 0x0004 }]
			},
			"Rainy 75": {
				name: "WOBKEY Rainy 75",
				image: "https://assets.signalrgb.com/devices/brands/wobkey/keyboards/rainy-75.png",
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Del", "Home",
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", "Backspace", "End",
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\", "PgUp",
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", "Enter", "PgDn",
					"Left Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Right Shift", "Up Arrow",
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Right Ctrl", "Left Arrow", "Down Arrow", "Right Arrow",
				],
				vLeds:  [
					0,  2,  3,  4,  5,  6,  7,  8, 9, 10, 11, 12, 13, 16, 17,
					21,	22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 38,
					42,  43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 59,
					63,  64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 	 76, 80,
					84,  86, 87, 88, 89, 90, 91, 92, 93, 94, 95, 	97,  99,
					105, 106, 107,		108,		109, 110, 111,  120, 121, 122,
				],
				vLedPositions: [
					[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [13, 0], [14, 0],
					[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1],
					[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2],
					[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3],		   [13, 3], [14, 3],
					[0, 4],         [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4],
					[0, 5], [1, 5], [2, 5],							[6, 5],					[9, 5], [10, 5], [11, 5], [12, 5], [13, 5], [14, 5],
				],
				size: [15, 6],
				endpoint: [{ "interface": 2, "usage": 0x0092, "usage_page": 0xFF1C, "collection": 0x0004 }]
			},
			"Kreo Hive98": {
				name: "Kreo Hive98",
				image: "https://assets.signalrgb.com/devices/brands/kreo/keyboards/hive98.png",
				vLedNames: [
					"Esc", "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "Del", "Insert", "PgUp", "PgDn",
					"`", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-_", "=+", 			"Backspace", "Num Lock", "Num /", "Num *", "Num -",
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\", 				 "Num 7", "Num 8", "Num 9", "Num +",
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", 				"Enter", "Num 4", "Num 5", "Num 6",
					"Left Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", "Right Shift", "Up Arrow", "Num 1", "Num 2", "Num 3", "Num Enter",
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Right Ctrl", "Left Arrow", "Down Arrow", "Right Arrow", "Num 0", "Num Del"
				],
				vLeds:  [
					0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
					19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 37,
					41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58,
					59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74,
					75, 76, 77, 78, 79, 80, 81, 82, 83, 84, 85, 86, 87, 88, 89, 90, 91,
					92, 93, 94, 			95, 		96, 97,		99, 100, 101, 102, 103, 104
				],
				vLedPositions: [
					[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [9, 0], [10, 0], [11, 0], [12, 0], [13, 0], [14, 0], [15, 0], [16, 0],
					[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1], [15, 1], [16, 1], [17, 1],
					[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2], [15, 2], [16, 2], [17, 2],
					[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], 		   [13, 3], [14, 3], [15, 3], [16, 3],
					[0, 4], 		[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], [13, 4], [14, 4], [15, 4], [16, 4], [17, 4],
					[0, 5], [1, 5], [2, 5], 						[6, 5], 						[10, 5], [11, 5], [12, 5], [13, 5], [14, 5], [15, 5], [16, 5], [17, 5],
				],
				size: [18, 6],
				endpoint: [{ "interface": 2, "usage": 0x0092, "usage_page": 0xFF1C, "collection": 0x0004 }]
			},
			"Redragon K580 Vata": {
				name: "Redragon K580 Vata",
				image: "https://assets.signalrgb.com/devices/brands/redragon/keyboards/k580.png",
				vLedNames: [
					"Left strip 1",																																															"Right strip 1",
					"Left strip 2",	"Esc",     "F1", "F2", "F3", "F4",   "F5", "F6", "F7", "F8",    "F9", "F10", "F11", "F12",		"Print Screen",	"Scroll Lock",	"Pause Break", 											"Right strip 2",
					"Left strip 3",	"`", "1",  "2", "3", "4", "5",  "6", "7", "8", "9", "0",  "-",   "+",  "Backspace",				"Insert",		"Home",			"Page Up",		"NumLock", "Num /", "Num *", "Num -", 	"Right strip 3",
					"Left strip 4",	"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\",						"Del",			"End",			"Page Down",	"Num 7", "Num 8", "Num 9", "Num +", 	"Right strip 4",
					"Left strip 5",	"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", 			 "Enter",															"Num 4", "Num 5", "Num 6", 				"Right strip 5",
					"Left strip 6",	"Left Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", 	  "Right Shift",							"Up Arrow",						"Num 1", "Num 2", "Num 3", "Num Enter", "Right strip 6",
					"Left strip 7",	"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Menu", "Right Ctrl",			"Left Arrow",	"Down Arrow",	"Right Arrow",	"Num 0",		  "Num .", 				"Right strip 7",
					"Left strip 8",																																															"Right strip 8",
				],
				vLeds:  [
					7, 																										127,
					15,   0,      8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96,    104, 112, 120,							119,
					23,   1,  9, 17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97, 105,   113, 121, 129,    128, 136, 137, 138,	111,
					31,   2, 10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 90, 98, 106,   114, 122, 130,    115, 123, 131, 139,	103,
					39,   3, 11, 19, 27, 35, 43, 51, 59, 67, 75, 83, 91,     107,					  124, 132, 140,		95,
					47,   4,     20, 28, 36, 44, 52, 60, 68, 76, 84, 92,	108,         116,		  109, 117, 125, 133,	87,
					55,   5, 13, 21,                 29,           37, 45, 53, 61,    69, 77, 85,      93,      101,		79,
					63,																										71,
				],
				vLedPositions: [
					[0, 0],																																															[23, 0], //2
					[0, 1], [1, 1],			[3, 1], [4, 1], [5, 1], [6, 1],	[7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1], [14, 1],	[15, 1], [17, 1], [18, 1],										[23, 1], //23
					[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2], [14, 2],	[15, 2], [17, 2], [18, 2],	[19, 2], [20, 2], [21, 2], [22, 2], [23, 2], //24
					[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], [12, 3], [13, 3], [14, 3], 	[15, 3], [17, 3], [18, 3],	[19, 3], [20, 3], [21, 3], [22, 3], [23, 3], //24
					[0, 4], [1, 4], [2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4], [12, 4], 			[14, 4],								[19, 4], [20, 4], [21, 4],			[23, 4], //19
					[0, 5], 		[2, 5], [3, 5], [4, 5], [5, 5], [6, 5], [7, 5], [8, 5], [9, 5], [10, 5], [11, 5], [12, 5], 			[14, 5],			 [17, 5],			[19, 5], [20, 5], [21, 5], [22, 5], [23, 5], //19
					[0, 6], [1, 6], [2, 6], [3, 6],					[6, 6],									 [11, 6], [12, 6], [13, 6], [14, 6],	[15, 6], [17, 6], [18, 6], 	[19, 6],		  [21, 6],			[23, 7],
					[0, 7],																																															[23, 7],
				],
				size: [24, 8],
				endpoint: [{ "interface": 1, "usage": 0x0092, "usage_page": 0xFF1C, "collection": 0x0004 }]
			},
			"Redragon K557 Kala V2": {
				name: "Redragon K557 Kala V2",
				image: "https://assets.signalrgb.com/devices/brands/redragon/keyboards/k557.png",
				vLedNames: [
					"Esc",     "F1", "F2", "F3", "F4",   "F5", "F6", "F7", "F8",    "F9", "F10", "F11", "F12",		"Print Screen",	"Scroll Lock",	"Pause Break",
					"`", "1",  "2", "3", "4", "5",  "6", "7", "8", "9", "0",  "-",   "+",  "Backspace",				"Insert",		"Home",			"Page Up",		"NumLock", "Num /", "Num *", "Num -",
					"Tab", "Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]", "\\",						"Del",			"End",			"Page Down",	"Num 7", "Num 8", "Num 9", "Num +",
					"CapsLock", "A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'", 			 "Enter",															"Num 4", "Num 5", "Num 6",
					"Left Shift", "Z", "X", "C", "V", "B", "N", "M", ",", ".", "/", 	  "Right Shift",							"Up Arrow",						"Num 1", "Num 2", "Num 3", "Num Enter",
					"Left Ctrl", "Left Win", "Left Alt", "Space", "Right Alt", "Fn", "Menu", "Right Ctrl",			"Left Arrow",	"Down Arrow",	"Right Arrow",	"Num 0",		  "Num .",
				],
				vLeds:  [
					0,   8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96,    		104, 112, 120,
					1,  9, 17, 25, 33, 41, 49, 57, 65, 73, 81, 89, 97,    105, 	113, 121, 115,   	6, 14, 22, 30,
					2,  10, 18, 26, 34, 42, 50, 58, 66, 74, 82, 98, 99, 12, 	114, 122, 123,  		38, 46, 54, 86,
					3,  11, 19, 27, 35, 43, 51, 59, 67, 75, 92,  91,   107,                   		62, 70, 78,
					4,      20, 28, 36, 44, 52, 60, 68, 76, 84, 100,   108,       	116,        		124, 94, 102, 126,
					5,  13, 21,                 45,             77, 85, 93, 101, 109, 117, 125,  	110,     118,
				],
				vLedPositions: [
					[0, 0],			[1, 0], [2, 0], [3, 0], [4, 0], [5, 0], [6, 0], [7, 0], [8, 0], [ 9, 0], [11, 0], [12, 0], [13, 0],		[14, 0], [15, 0], [16, 0],
					[0, 1], [1, 1], [2, 1], [3, 1], [4, 1], [5, 1], [6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1],		[14, 1], [15, 1], [16, 1],		[17, 1], [18, 1], [19, 1], [20, 1],
					[0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [5, 2], [6, 2], [7, 2], [8, 2], [9, 2], [10, 2], [11, 2], [12, 2], [13, 2],		[14, 2], [15, 2], [16, 2],		[17, 2], [18, 2], [19, 2], [20, 2],
					[0, 3], [1, 3], [2, 3], [3, 3], [4, 3], [5, 3], [6, 3], [7, 3], [8, 3], [9, 3], [10, 3], [11, 3], 		   [13, 3],										[17, 3], [18, 3], [19, 3],
					[0, 4], 		[2, 4], [3, 4], [4, 4], [5, 4], [6, 4], [7, 4], [8, 4], [9, 4], [10, 4], [11, 4],		   [13, 4],				 [15, 4],				[17, 4], [18, 4], [19, 4], [20, 4],
					[0, 5], [1, 5], [2, 5],							[6, 5],							[10, 5], [11, 5], [12, 5], [13, 5],		[14, 5], [15, 5], [16, 5],		[17, 5],		  [19, 5],
				],
				size: [21, 6],
				endpoint: [{ "interface": 1, "usage": 0x0092, "usage_page": 0xFF1C, "collection": 0x0004 }]
			},

			// VIA devices that needs QMK
			"EPOMAKER MS68": {
				name: "EPOMAKER MS68",
				image: "https://assets.signalrgb.com/devices/default/misc/usb-drive-render.png",
				layout:	"QMK",
			},
			"EPOMAKER EK21": {
				name: "EPOMAKER EK21",
				image: "https://assets.signalrgb.com/devices/default/misc/usb-drive-render.png",
				layout:	"QMK",
			},

			// Unsupported devices
			"2.4G Dongle": {
				name: "Wireless Dongle",
				image: "https://assets.signalrgb.com/devices/default/misc/usb-drive-render.png",
				layout:	"None",
			},

			"None": {
				name: "EVision Device",
				image: "https://assets.signalrgb.com/devices/default/misc/usb-drive-render.png",
				layout:	"None",
			},
		};

		// Firmware LED slots reconstructed with direct HID test frames and the
		// Discord camera feed. The AK820 uses 16 electrical columns of eight slots;
		// populated keys run bottom-to-top within each column.
		this.LEDLibrary["AK820"] = {
			name: "Ajazz AK820",
			image: "https://assets.signalrgb.com/devices/brands/ajazz/keyboards/ak820-pro.png",
			vLedNames: this.LEDLibrary["VGN N75"].vLedNames,
			vLeds: [
				5,  13,  21,  28,  36,  44,  53,  60,  68,  77,  85,  93, 100, 107,
				4,  12,  20,  27,  35,  43,  52,  59,  67,  76,  84,  92,  99, 106, 116,
				3,  11,  19,  26,  34,  42,  51,  58,  66,  75,  83,  91,  98, 105, 115,
				2,  10,  18,  25,  33,  41,  50,  57,  65,  74,  82,  90,      97, 114,
				1,       9,  17,  24,  32,  40,  49,  56,  64,  73,  81,  89,  96, 113,
				0,   8,  16,              48,              72,  80,  88, 104, 112, 120,
			],
			vLedPositions: this.LEDLibrary["VGN N75"].vLedPositions,
			size: this.LEDLibrary["VGN N75"].size,
			endpoint: [{ "interface": 1, "usage": 0x0092, "usage_page": 0xFF1C, "collection": 0x0004 }]
		};
	}
}

const EVISIONdeviceLibrary = new deviceLibrary();
const EVISION = new EVISION_Device_Protocol();

function hexToRgb(hex) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	const colors = [];
	colors[0] = parseInt(result[1], 16);
	colors[1] = parseInt(result[2], 16);
	colors[2] = parseInt(result[3], 16);

	return colors;
}
