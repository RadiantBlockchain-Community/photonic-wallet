import { Button, Flex, FlexProps, Grid } from "@chakra-ui/react";
import { t } from "@lingui/macro";
import { openModal } from "@app/signals";
import ValueTag from "./ValueTag";
import ActionIcon from "./ActionIcon";
import { TbArrowDownLeft, TbArrowUpRight } from "react-icons/tb";
import Balance from "./Balance";

export default function AccountBar(props: FlexProps) {
  return (
    <Flex flexDir="column" alignItems="center" mx={4} {...props}>
      <ValueTag mb={{ base: 2, lg: 6 }}>
        <Balance />
      </ValueTag>
      <Grid
        gridTemplateColumns="repeat(2, minmax(0, 1fr))"
        gap={{ base: 2, "2xl": 4 }}
        w={{ base: "100%", lg: "initial" }}
      >
        <Button
          size={{ base: "sm", "2xl": "md" }}
          leftIcon={<ActionIcon as={TbArrowDownLeft} />}
          onClick={() => (openModal.value = { modal: "receive" })}
        >
          {t`Receive`}
        </Button>
        <Button
          size={{ base: "sm", "2xl": "md" }}
          leftIcon={<ActionIcon as={TbArrowUpRight} />}
          onClick={() => (openModal.value = { modal: "send" })}
        >
          {t`Send`}
        </Button>
      </Grid>
    </Flex>
  );
}
