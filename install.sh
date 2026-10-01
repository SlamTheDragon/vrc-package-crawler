echo " "
echo "==========[ Installing dependencies with bun ]========="
echo " "
echo "==========[             STEP 1/4             ]========="
cd src-crawler && bun i && cd ..
echo "==========[             STEP 2/4             ]========="
cd src-crawler-client && bun i && cd ..
echo "==========[             STEP 3/4             ]========="
cd src-package && bun i && cd ..
echo "==========[             STEP 4/4             ]========="
cd src-web && bun i && cd ..
echo " "
echo "==========[  Installed dependencies with bun ]========="
echo " "