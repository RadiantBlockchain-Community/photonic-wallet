import { createHashRouter, RouterProvider } from "react-router-dom";
import {
  ChakraProvider,
  extendTheme,
  ToastProviderProps,
  ButtonProps,
} from "@chakra-ui/react";
import ReactDOM from "react-dom/client";
import dayjs from "dayjs";
import localizedFormat from "dayjs/plugin/localizedFormat";
import App from "./App";
import Servers from "./pages/Servers";
import WalletSettings from "./pages/WalletSettings";
import CreateWallet from "./pages/CreateWallet";
import Root from "./pages/Root";
import RecoverWallet from "./pages/RecoverWallet";
import SettingsLayout from "./layouts/SettingsLayout";
import Mint from "./pages/Mint";
import Wallet from "./pages/Wallet";
import WalletLayout from "./layouts/WalletLayout";
import Placeholder from "./pages/Placeholder";
import "@fontsource-variable/inter";
import "@fontsource-variable/source-code-pro";
import "./index.css";
import Coins from "./pages/Coins";
import MobileHome from "./pages/MobileHome";
import IpfsSettings from "./pages/IpfsSettings";
import About from "./pages/About";
import LogOut from "./pages/LogOut";
import gradient from "/gradient.svg";
import Exit from "./pages/Exit";
import Fungible from "./pages/Fungible";
import SetupLayout from "./layouts/SetupLayout";

dayjs.extend(localizedFormat);

const theme = extendTheme({
  config: {
    initialColorMode: "dark",
    useSystemColorMode: false,
  },
  sizes: {
    container: {
      xl: "1600px",
    },
  },
  styles: {
    global: () => ({
      body: {
        bg: "bg.200",
      },
    }),
  },
  fonts: {
    heading: `'Inter Variable', sans-serif`,
    body: `'Inter Variable', sans-serif`,
    mono: `'Source Code Pro Variable', monospace`,
  },
  components: {
    Input: {
      defaultProps: {
        variant: "filled",
        focusBorderColor: "lightBlue.A400",
      },
    },
    Textarea: {
      defaultProps: {
        variant: "filled",
        focusBorderColor: "lightBlue.A400",
      },
    },
    Select: {
      defaultProps: {
        variant: "filled",
        focusBorderColor: "lightBlue.A400",
      },
    },
    Tag: {
      defaultProps: {
        variant: "solid",
        colorScheme: "deepPurple",
      },
      variants: {
        solid: {
          container: {
            bg: `deepPurple.A400`,
          },
        },
      },
    },
    Tabs: {
      variants: {
        line: {
          tab: {
            _selected: {
              color: "chakra-body-text",
              borderColor: "deepPurple.A100",
              bg: `url(${gradient})`,
              bgSize: "cover",
              bgPosition: "center center",
            },
            _active: {
              bg: "transparent",
              borderColor: "deepPurple.A100",
            },
          },
        },
      },
    },
    Alert: {
      variants: {
        subtle: {
          // Default subtle toast colours are too transparent and difficult to read
          // This will apply to Alert and Toast
          container: {
            "&[data-status='success']": { bg: "#1C4532EE" },
            "&[data-status='error']": { bg: "#C53030EE" },
            "&[data-status='warning']": { bg: "#C05621EE" },
            "&[data-status='info']": { bg: "#1A365DEE" },
          },
        },
      },
    },
    Button: {
      baseStyle: {
        transition: "none",
        fontWeight: "medium",
      },
      variants: {
        primary: (props: ButtonProps) => {
          return {
            ...theme.components.Button.variants.solid(props),
            position: "relative",
            bg: `url(${gradient})`,
            bgSize: "cover",
            bgPosition: "center center",
            _hover: {
              filter: "brightness(1.1)",
              _disabled: {
                bg: "deepPurple.A700",
              },
            },
            _active: {
              filter: "brightness(1.5)",
            },
          };
        },
      },
    },
    Modal: {
      baseStyle: {
        overlay: {
          bg: "blackAlpha.400",
          backdropFilter: "blur(24px)",
        },
        dialog: {
          mx: { base: 4, md: 0 },
          bgGradient: "linear(to-b, transparent, blackAlpha.500)",
          bgColor: "#2D2D2DA0",
        },
        body: {
          display: "flex",
          flexDirection: "column",
        },
      },
    },
  },
  // Material colors
  colors: {
    gray: {
      50: "#F7F7F7",
      100: "#EDEDED",
      200: "#E2E2E2",
      300: "#CBCBCB",
      400: "#A0A0A0",
      500: "#717171",
      600: "#4A4A4A",
      700: "#2D2D2D",
      800: "#1A1A1A",
      900: "#171717",
    },
    purple: {
      50: "#f3e5f5",
      100: "#e1bee7",
      200: "#ce93d8",
      300: "#ba68c8",
      400: "#ab47bc",
      500: "#9c27b0",
      600: "#8e24aa",
      700: "#7b1fa2",
      800: "#6a1b9a",
      900: "#4a148c",
      A100: "#ea80fc",
      A200: "#e040fb",
      A400: "#d500f9",
      A700: "#aa00ff",
    },
    deepPurple: {
      50: "#ede7f6",
      100: "#d1c4e9",
      200: "#b39ddb",
      300: "#9575cd",
      400: "#7e57c2",
      500: "#673ab7",
      600: "#5e35b1",
      700: "#512da8",
      800: "#4527a0",
      900: "#311b92",
      A100: "#b388ff",
      A200: "#7c4dff",
      A400: "#651fff",
      A700: "#6200ea",
    },
    lightBlue: {
      50: "#e1f5fe",
      100: "#b3e5fc",
      200: "#81d4fa",
      300: "#4fc3f7",
      400: "#29b6f6",
      500: "#03a9f4",
      600: "#039be5",
      700: "#0288d1",
      800: "#0277bd",
      900: "#01579b",
      A100: "#80d8ff",
      A200: "#40c4ff",
      A400: "#00b0ff",
      A700: "#0091ea",
    },
    bg: {
      50: "#323235",
      100: "#2c2c32",
      200: "#26262b",
      300: "#202024",
      400: "#19191d",
    },
    blueGrayAlpha: {
      50: "#4A55680a",
      100: "#4A55680f",
      200: "#4A556814",
      300: "#4A556828",
      400: "#4A55683D",
      500: "#4A55685B",
      600: "#4A55687A",
      700: "#4A5568A3",
      800: "#4A5568CC",
      900: "#4A5568EA",
    },
  },
  shadows: {
    "dark-md":
      "rgba(0, 0, 0, 0.1) 0px 0px 0px 1px, rgba(0, 0, 0, 0.1) 0px 10px 10px, rgba(0, 0, 0, 0.1) 0px 2px 20px",
  },
});

const router = createHashRouter([
  {
    path: "/",
    element: <App />,
    errorElement: <div>Error</div>, // TODO
    children: [
      {
        path: "",
        element: <Root />,
      },
      {
        element: <SetupLayout />,
        children: [
          {
            path: "/create-wallet",
            element: <CreateWallet />,
          },
          {
            path: "/recover",
            element: <RecoverWallet />,
          },
        ],
      },
      {
        element: <WalletLayout />,
        children: [
          {
            path: "/home",
            element: <MobileHome />,
          },
          {
            path: "/container/:containerRef/:page?/:lastId?",
            element: <Wallet />,
          },
          {
            path: "/container/:containerRef/token/:sref/:page?/:lastId?",
            element: <Wallet />,
          },
          {
            path: "/objects/:page?/:lastId?",
            element: <Wallet />,
          },
          {
            path: "/objects/token/:sref",
            element: <Wallet />,
          },
          {
            path: "/fungible",
            element: <Fungible />,
          },
          {
            path: "/fungible/token/:sref",
            element: <Fungible />,
          },
          {
            path: "/coins",
            element: <Coins />,
          },
          {
            path: "/history",
            element: <Placeholder />,
          },
          {
            path: "/mint/user",
            element: <Mint tokenType="user" />,
          },
          {
            path: "/mint/container",
            element: <Mint tokenType="container" />,
          },
          {
            path: "/mint/object",
            element: <Mint tokenType="object" />,
          },
          {
            path: "/mint/fungible",
            element: <Mint tokenType="fungible" />,
          },
          {
            path: "/names",
            element: <Placeholder />,
          },
          {
            element: <SettingsLayout />,
            children: [
              {
                path: "/settings/servers",
                element: <Servers />,
              },
              {
                path: "/settings/wallet",
                element: <WalletSettings />,
              },
              {
                path: "/settings/about",
                element: <About />,
              },
              {
                path: "/settings/ipfs",
                element: <IpfsSettings />,
              },
              {
                path: "/settings/logout",
                element: <LogOut />,
              },
            ],
          },
        ],
      },
      { path: "/exit", element: <Exit /> },
    ],
  },
]);

const toastOptions: ToastProviderProps = {
  defaultOptions: {
    containerStyle: {
      mb: 14,
    },
    duration: 5000,
    variant: "subtle",
  },
};

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  /*<React.StrictMode>*/
  <ChakraProvider theme={theme} toastOptions={toastOptions}>
    <RouterProvider router={router} />
  </ChakraProvider>
  /*</React.StrictMode>*/
);
