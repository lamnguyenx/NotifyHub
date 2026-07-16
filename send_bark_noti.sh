#!/usr/bin/env bash

# Documentation: https://bark.day.app/#/en-us/encryption

set -e

deviceKey=$(security find-generic-password -a "$USER" -s "bark_noti_device_key" -w)
# push payload


project_dir="$HOME/git/empty"
seed=$(basename "$project_dir" | head -c 1 | tr '[:lower:]' '[:upper:]')
json='{
	"title": "'$project_dir'",
	"body": "Actually, I think the real problem might be: when you press Esc to interrupt",
	"icon": "https://api.dicebear.com/9.x/initials/jpg?seed='$seed'&radius=50"
}'

aes_private_key=$(security find-generic-password -a "$USER" -s "bark_noti_aes_key" -w)
# IV can be randomly generated, but if it is random, it needs to be passed in the aes_init_vector parameter.
aes_init_vector=$(security find-generic-password -a "$USER" -s "bark_noti_aes_init_vector" -w)

# openssl requires Hex encoding of manual keys and IVs, not ASCII encoding.
aes_private_key=$(printf $aes_private_key | xxd -ps -c 200)
aes_init_vector=$(printf $aes_init_vector | xxd -ps -c 200)

# If you get a 'Decryption Failed' prompt, try adding '-w 0' after the base64 command.
ciphertext=$(echo -n $json | openssl enc -aes-128-cbc -K $aes_private_key -iv $aes_init_vector | base64)

echo $ciphertext

# URL encoding the ciphertext, there may be special characters.
curl --data-urlencode "ciphertext=$ciphertext" --data-urlencode "aes_init_vector=$aes_init_vector" "https://api.day.app/$deviceKey/Icon"
